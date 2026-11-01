/*
  Edge device (tier 2), one for each forest region
  Board    : ESP32 Dev Module
  Core     : esp32 by Espressif Systems 3.3.12
  Library  : ArduinoJson
  Serial   : 115200 baud

  Takes readings from the sensor nodes on the region's router, does the basic checks, keeps them in
  a buffer, and sends them to Supabase over HTTPS with this device's own token. If the internet or
  Supabase is down it keeps them and tries again later. iot/README.md says how to set it up.

  The buffer is in RAM, so a power cut loses whatever hasn't been sent yet. The server is fine with
  a reading being sent twice, so nothing here has to be exact about what got through.
*/

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include "secrets.h"

// buffer
const int BUFFER_SIZE       = 180;   // 3 nodes for an hour, and the oldest goes first if it fills
const int READING_MAX_BYTES = 320;
const int BATCH_SIZE        = 20;    // iot_add_readings takes up to 100, but RAM runs out first

// timing
const uint32_t SEND_MS      = 10000;   // send what's waiting this often, which fits the 30 second goal
const uint32_t CATCH_UP_MS  = 1000;    // how soon to send again when more is waiting after a batch
const uint32_t HEARTBEAT_MS = 300000;  // with nothing to send, say we're alive this often
const uint32_t RETRY_MIN_MS = 5000;    // wait after a failed send, which doubles each time
const uint32_t RETRY_MAX_MS = 300000;
const uint32_t NOT_ALLOWED_RETRY_MS = 300000;  // when the database turns this device down
const uint16_t HTTP_TIMEOUT_MS = 15000;

// The basic checks. A value no sensor could read is taken out and the rest of the reading is kept,
// so one broken probe doesn't lose the tilt. The real ranges and the threat rules are on the server.
struct Range {
  const char *field;
  float lowest;
  float highest;
};
const Range RANGES[] = {
  {"temperature_c", -20, 70},
  {"humidity_percent", 0, 100},
  {"soil_moisture_percent", 0, 100},
  {"rain_percent", 0, 100},
  {"battery_percent", 0, 100},
  {"tilt_degrees", 0, 180},
  {"shock_g", 0, 32},
  {"distance_change_cm", 0, 500},
};

struct BufferedReading {
  uint32_t arrivedAt;              // millis() when it came in, for working out recorded_at
  char json[READING_MAX_BYTES];
};

// In global memory rather than on the stack, because it's big
BufferedReading buffer[BUFFER_SIZE];
int bufferStart = 0;   // the oldest
int bufferCount = 0;
uint32_t droppedCount = 0;

WebServer server(80);
WiFiClientSecure tlsClient;

uint32_t lastSend = 0;
uint32_t lastContact = 0;
uint32_t waitUntilGap = SEND_MS;
uint32_t retryGap = RETRY_MIN_MS;

bool clockIsSet() {
  // Anything after 2020 means NTP has answered. The certificate check needs this as well.
  return time(nullptr) > 1577836800;
}

bool nodeIsAllowed(const char *node) {
  for (const char *allowed : ALLOWED_NODES) {
    if (strcmp(allowed, node) == 0) return true;
  }
  return false;
}

void addToBuffer(uint32_t arrivedAt, const String &json) {
  if (bufferCount == BUFFER_SIZE) {
    bufferStart = (bufferStart + 1) % BUFFER_SIZE;
    bufferCount--;
    droppedCount++;
    Serial.printf("Buffer is full, so the oldest reading is lost (%lu so far)\n", (unsigned long)droppedCount);
  }
  BufferedReading &slot = buffer[(bufferStart + bufferCount) % BUFFER_SIZE];
  slot.arrivedAt = arrivedAt;
  strlcpy(slot.json, json.c_str(), READING_MAX_BYTES);
  bufferCount++;
}

// POST /reading from a sensor node
void handleReading() {
  if (server.header("X-Node-Secret") != NODE_SECRET) {
    server.send(401, "text/plain", "wrong secret");
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "text/plain", "not JSON");
    return;
  }

  const char *node = doc["node_id"] | "";
  const char *readingId = doc["reading_id"] | "";
  if (!nodeIsAllowed(node)) {
    Serial.printf("Turned down a reading from %s, which isn't on the allowed list\n", node);
    server.send(403, "text/plain", "node not allowed");
    return;
  }
  if (strlen(readingId) == 0 || strlen(readingId) > 64) {
    server.send(400, "text/plain", "bad reading_id");
    return;
  }

  for (const Range &range : RANGES) {
    // Has to be the const kind. The other kind adds the field as null if it isn't there.
    JsonVariantConst value = doc[range.field];
    if (value.isNull()) continue;
    float number = value.as<float>();
    if (!value.is<float>() || isnan(number) || number < range.lowest || number > range.highest) {
      Serial.printf("%s sent a bad %s, so that value is left out\n", node, range.field);
      doc.remove(range.field);
    }
  }

  String json;
  serializeJson(doc, json);
  if (json.length() >= READING_MAX_BYTES) {
    server.send(400, "text/plain", "reading too long");
    return;
  }
  addToBuffer(millis(), json);
  server.send(200, "text/plain", "ok");
}

// Sends up to BATCH_SIZE of the oldest readings, or none as a heartbeat. Only forgets them when the
// server says it has them.
void sendBatch() {
  int count = min(bufferCount, BATCH_SIZE);

  JsonDocument doc;
  doc["device"] = DEVICE_ID;
  doc["token"] = DEVICE_TOKEN;
  JsonArray readings = doc["readings"].to<JsonArray>();

  time_t nowSeconds = time(nullptr);
  uint32_t nowMillis = millis();
  for (int i = 0; i < count; i++) {
    const BufferedReading &slot = buffer[(bufferStart + i) % BUFFER_SIZE];
    JsonDocument one;
    if (deserializeJson(one, slot.json)) continue;

    // The time it arrived here, which is within a second or two of when the node took it
    time_t recorded = nowSeconds - (nowMillis - slot.arrivedAt) / 1000;
    char when[25];
    strftime(when, sizeof(when), "%Y-%m-%dT%H:%M:%SZ", gmtime(&recorded));
    one["recorded_at"] = when;
    readings.add(one);
  }

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(tlsClient, String(SUPABASE_URL) + "/rest/v1/rpc/iot_add_readings");
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
  http.addHeader("Authorization", "Bearer " SUPABASE_PUBLISHABLE_KEY);
  int status = http.POST(body);
  String answer = status > 0 ? http.getString() : "";
  http.end();

  lastSend = millis();

  if (status == 200) {
    // Readings the server turned down are forgotten too. Sending them again wouldn't change the answer.
    Serial.printf("Sent %d: %s\n", count, answer.c_str());
    bufferStart = (bufferStart + count) % BUFFER_SIZE;
    bufferCount -= count;
    lastContact = lastSend;
    retryGap = RETRY_MIN_MS;
    waitUntilGap = bufferCount > 0 ? CATCH_UP_MS : SEND_MS;
  } else if (status == 401 || status == 403) {
    // A wrong token or a device an admin turned off. Keep the readings and don't keep hammering.
    Serial.printf("The database turned this device down (%d). Check DEVICE_ID and DEVICE_TOKEN.\n", status);
    waitUntilGap = NOT_ALLOWED_RETRY_MS;
  } else if (status == 400) {
    // Something's wrong with what this sketch built, and it won't get better by sending it again
    Serial.printf("The database refused the whole batch, so it's dropped: %s\n", answer.c_str());
    bufferStart = (bufferStart + count) % BUFFER_SIZE;
    bufferCount -= count;
    lastContact = lastSend;
    retryGap = RETRY_MIN_MS;
    waitUntilGap = SEND_MS;
  } else {
    // No internet, or the server is having trouble. Keep them and wait longer each time.
    Serial.printf("Couldn't send (%d: %s). Trying again in %lu s\n", status,
                  status < 0 ? http.errorToString(status).c_str() : "server error",
                  (unsigned long)(retryGap / 1000));
    waitUntilGap = retryGap;
    retryGap = min(retryGap * 2, RETRY_MAX_MS);
  }
}

void setup() {
  Serial.begin(115200);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  configTime(0, 0, "pool.ntp.org", "time.google.com");

  // Every request gets its certificate checked against this. Never use setInsecure() here, because
  // the device token goes in the request.
  tlsClient.setCACert(SUPABASE_ROOT_CA);

  const char *headers[] = {"X-Node-Secret"};
  server.collectHeaders(headers, 1);
  server.on("/reading", HTTP_POST, handleReading);
  server.begin();

  Serial.printf("\nEdge device %s started\n", DEVICE_ID);
}

void loop() {
  // Only one thing runs at a time, so a node that sends during a slow HTTPS call has to try again.
  // The sensor node does.
  server.handleClient();

  static bool saidAddress = false;
  if (WiFi.status() != WL_CONNECTED) {
    saidAddress = false;
    return;
  }
  if (!saidAddress) {
    saidAddress = true;
    Serial.print("Sensor nodes send to http://");
    Serial.print(WiFi.localIP());
    Serial.println("/reading");
  }

  // recorded_at is worked out from the clock, so wait for it rather than send a wrong time
  if (!clockIsSet()) return;

  uint32_t now = millis();
  bool due = now - lastSend >= waitUntilGap;
  bool heartbeatDue = now - lastContact >= HEARTBEAT_MS;
  if (due && (bufferCount > 0 || heartbeatDue)) sendBatch();
}

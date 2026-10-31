/*
  Sensor node (tier 1)
  Board    : ESP32 Dev Module
  Core     : esp32 by Espressif Systems 3.3.12
  Libraries: DHT sensor library, Adafruit Unified Sensor, ArduinoJson
  Serial   : 115200 baud

  Reads its sensors and sends a reading to the region's edge device over the router's WiFi, once a
  minute, and straight away if something looks wrong. The edge device passes it on to Supabase.
  The node only decides when to send. What counts as a threat is decided on the server (017).
  It has no actuators and no GPS. iot/README.md has the wiring and how to flash it.

  The pins and the soil and rain numbers come from iot/testing/esp32-thing-standalone. The MPU 6050
  and the PIR haven't been tried on the board yet, so turn them off below if yours doesn't have them.
*/

#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <math.h>

#include "secrets.h"

// Which parts this node has. A part that's turned off is left out of the reading.
#define HAS_MPU6050 1
#define HAS_PIR     1
#define HAS_BATTERY 1

// pin map
#define DHT_PIN        21
#define SOIL_AO_PIN    36   // VP, ADC1
#define SOIL_PWR_PIN   17
#define RAIN_AO_PIN    39   // VN, ADC1
#define RAIN_PWR_PIN   19
#define US_TRIG_PIN     5
#define US_ECHO_PIN    16   // through a 1k/2k divider, which is required
#define PIR_PIN        27
#define BATTERY_PIN    34   // ADC1, through a 100k/100k divider
#define MPU_SDA_PIN    25   // not the default 21, because the DHT11 is on that
#define MPU_SCL_PIN    26
#define MPU_ADDRESS  0x68

// timing
const uint32_t REPORT_MS    = 60000;  // a reading every minute
const uint32_t CHECK_MS     = 20;     // how often to look at the MPU 6050 and PIR, so a knock isn't missed
const uint32_t DISTANCE_CHECK_MS = 1000;  // the ultrasonic can block for 30 ms, so it goes slower
const uint32_t ALERT_GAP_MS = 5000;   // the soonest a problem can send another reading
const int SEND_TRIES        = 3;      // the edge device can be busy sending for a few seconds
const uint32_t SEND_GAP_MS  = 2000;

// calibration (tune)
const int SOIL_DRY_RAW = 4095;
const int SOIL_WET_RAW = 1400;
const int RAIN_DRY_RAW = 4095;
const int RAIN_WET_RAW = 1500;
const unsigned long US_TIMEOUT = 30000;  // ~5 m round trip max
// A full battery and an empty one, measured at the battery, for a single cell lithium battery
const float BATTERY_FULL_V  = 4.2;
const float BATTERY_EMPTY_V = 3.3;
const float BATTERY_DIVIDER = 2.0;

// Past these the node sends straight away instead of waiting for the next minute. They match the
// starting values in iot_alert_limits, but the server's numbers are the ones that raise alerts.
const float SEND_NOW_TILT_DEGREES = 30.0;
const float SEND_NOW_SHOCK_G      = 2.5;
const float SEND_NOW_DISTANCE_CM  = 10.0;

// With the range set to 16 g, one g reads as this many counts
const float MPU_COUNTS_PER_G = 2048.0;

// globals
DHT dht(DHT_PIN, DHT11);
uint32_t lastReport = 0, lastCheck = 0, lastDistanceCheck = 0, lastAlertSend = 0;
float usBaseline = -1;
float baseX = 0, baseY = 0, baseZ = 0;  // which way down was when the node started
bool mpuWorks = false;
float peakShock = 0;   // the hardest knock since the last reading
bool sawMotion = false;
bool pirWasOn = false;
bool wasTilted = false;
bool distanceWasOff = false;
bool sendWanted = false;  // something looked wrong, and it's waiting for ALERT_GAP_MS
char bootId[9];        // a new one each start, so reading IDs never repeat after a restart
uint32_t sequence = 0;

// Power a probe, wait for it to settle, average 16 ADC readings, power it off.
int readSwitchedSensor(uint8_t pwrPin, uint8_t aoPin) {
  digitalWrite(pwrPin, HIGH);
  delay(50);
  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) sum += analogRead(aoPin);
  digitalWrite(pwrPin, LOW);
  return sum / 16;
}

int rawToPercent(int raw, int dryRaw, int wetRaw) {
  return constrain(map(raw, dryRaw, wetRaw, 0, 100), 0, 100);
}

float readDistanceCm() {
  digitalWrite(US_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(US_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(US_TRIG_PIN, LOW);
  unsigned long us = pulseIn(US_ECHO_PIN, HIGH, US_TIMEOUT);
  if (us == 0) return -1;            // no echo
  return us * 0.0343f / 2.0f;
}

// How far the distance has moved since the first good reading, or -1 if there's no echo
float readDistanceChangeCm() {
  float d = readDistanceCm();
  if (d < 0) return -1;
  if (usBaseline < 0) usBaseline = d;   // first good reading becomes the reference
  return fabs(d - usBaseline);
}

#if HAS_MPU6050
void writeMpuRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

// High byte first. Two reads in one expression could run in either order.
int16_t readMpuWord() {
  uint8_t high = Wire.read();
  uint8_t low = Wire.read();
  return (int16_t)((high << 8) | low);
}

bool readAcceleration(float &x, float &y, float &z) {
  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(0x3B);  // the first acceleration register
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDRESS, 6) != 6) return false;
  x = readMpuWord() / MPU_COUNTS_PER_G;
  y = readMpuWord() / MPU_COUNTS_PER_G;
  z = readMpuWord() / MPU_COUNTS_PER_G;
  return true;
}

void startMpu() {
  Wire.begin(MPU_SDA_PIN, MPU_SCL_PIN);
  writeMpuRegister(0x6B, 0x00);  // wake it up
  writeMpuRegister(0x1C, 0x18);  // range of 16 g
  delay(100);
  mpuWorks = readAcceleration(baseX, baseY, baseZ);
  if (!mpuWorks) Serial.println("MPU 6050 : read FAILED, so no tilt or shock (check wiring)");
}

// The angle between which way down is now and which way it was at the start, so the node can be
// mounted at any angle.
float tiltFrom(float x, float y, float z) {
  float size = sqrt(x * x + y * y + z * z) * sqrt(baseX * baseX + baseY * baseY + baseZ * baseZ);
  if (size == 0) return 0;
  float cosine = (x * baseX + y * baseY + z * baseZ) / size;
  return acos(constrain(cosine, -1.0f, 1.0f)) * 180.0f / PI;
}
#endif

#if HAS_BATTERY
int readBatteryPercent() {
  uint32_t millivolts = 0;
  for (int i = 0; i < 16; i++) millivolts += analogReadMilliVolts(BATTERY_PIN);
  float volts = (millivolts / 16.0f) / 1000.0f * BATTERY_DIVIDER;
  float percent = (volts - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100.0f;
  return constrain((int)percent, 0, 100);
}
#endif

void sendReading() {
  JsonDocument doc;
  char readingId[64];
  sequence++;
  snprintf(readingId, sizeof(readingId), "%s-%s-%lu", NODE_ID, bootId, (unsigned long)sequence);
  doc["node_id"] = NODE_ID;
  doc["reading_id"] = readingId;

  // A sensor that fails is left out, so the rest of the reading still counts
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  if (!isnan(temperature)) doc["temperature_c"] = temperature;
  else Serial.println("DHT11 : read FAILED (check wiring)");
  if (!isnan(humidity)) doc["humidity_percent"] = humidity;

  doc["soil_moisture_percent"] =
    rawToPercent(readSwitchedSensor(SOIL_PWR_PIN, SOIL_AO_PIN), SOIL_DRY_RAW, SOIL_WET_RAW);
  doc["rain_percent"] =
    rawToPercent(readSwitchedSensor(RAIN_PWR_PIN, RAIN_AO_PIN), RAIN_DRY_RAW, RAIN_WET_RAW);

  float distanceChange = readDistanceChangeCm();
  if (distanceChange >= 0) doc["distance_change_cm"] = min(distanceChange, 500.0f);
  else Serial.println("HC-SR04 : no echo");

#if HAS_MPU6050
  float x, y, z;
  if (mpuWorks && readAcceleration(x, y, z)) {
    doc["tilt_degrees"] = tiltFrom(x, y, z);
    doc["shock_g"] = min(max(peakShock, sqrtf(x * x + y * y + z * z)), 32.0f);
  }
#endif

#if HAS_PIR
  doc["motion_detected"] = sawMotion;
#endif

#if HAS_BATTERY
  doc["battery_percent"] = readBatteryPercent();
#endif

  String body;
  serializeJson(doc, body);
  Serial.println(body);

  for (int attempt = 1; attempt <= SEND_TRIES; attempt++) {
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(EDGE_URL);
      http.setTimeout(5000);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-Node-Secret", NODE_SECRET);
      int status = http.POST(body);
      http.end();
      if (status == 200) {
        peakShock = 0;
        sawMotion = false;
        return;
      }
      Serial.printf("Edge device answered %d (try %d)\n", status, attempt);
      // It read the message and turned it down, so sending it again won't help
      if (status >= 400 && status < 500) return;
    } else {
      Serial.printf("No WiFi (try %d)\n", attempt);
    }
    delay(SEND_GAP_MS);
  }
  // The node doesn't keep readings. The edge device is what buffers them, and it should be up even
  // when the internet isn't. Keep the knock and the motion for the next reading.
  Serial.println("Couldn't reach the edge device, so this reading is lost");
}

// Looks at the sensors that can spot a problem. A problem asks for one reading when it starts, not
// one every few seconds for as long as it lasts, or a fallen node would flatten its battery.
void checkFastSensors() {
#if HAS_MPU6050
  float x, y, z;
  if (mpuWorks && readAcceleration(x, y, z)) {
    float shock = sqrtf(x * x + y * y + z * z);
    if (shock > peakShock) peakShock = shock;
    if (shock > SEND_NOW_SHOCK_G) sendWanted = true;

    bool tilted = tiltFrom(x, y, z) > SEND_NOW_TILT_DEGREES;
    if (tilted && !wasTilted) sendWanted = true;
    wasTilted = tilted;
  }
#endif

#if HAS_PIR
  bool pirOn = digitalRead(PIR_PIN) == HIGH;
  if (pirOn) sawMotion = true;
  if (pirOn && !pirWasOn) sendWanted = true;
  pirWasOn = pirOn;
#endif
}

void checkDistance() {
  float change = readDistanceChangeCm();
  bool off = change > SEND_NOW_DISTANCE_CM;   // -1 means no echo, which doesn't count
  if (off && !distanceWasOff) sendWanted = true;
  distanceWasOff = off;
}

void setup() {
  Serial.begin(115200);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db); // 0 - ~3.1 V input range

  pinMode(SOIL_PWR_PIN, OUTPUT);  digitalWrite(SOIL_PWR_PIN, LOW);
  pinMode(RAIN_PWR_PIN, OUTPUT);  digitalWrite(RAIN_PWR_PIN, LOW);
  pinMode(US_TRIG_PIN, OUTPUT);   digitalWrite(US_TRIG_PIN, LOW);
  pinMode(US_ECHO_PIN, INPUT);
#if HAS_PIR
  pinMode(PIR_PIN, INPUT);
#endif

  dht.begin();
  delay(2000);  // DHT11 needs ~1-2 s after power-up

#if HAS_MPU6050
  startMpu();
#endif

  snprintf(bootId, sizeof(bootId), "%08lx", (unsigned long)esp_random());

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.printf("\nSensor node %s started\n", NODE_ID);
  lastReport = millis() - REPORT_MS;  // send the first reading once WiFi is up
}

void loop() {
  uint32_t now = millis();

  if (now - lastCheck >= CHECK_MS) {
    lastCheck = now;
    checkFastSensors();
  }
  if (now - lastDistanceCheck >= DISTANCE_CHECK_MS) {
    lastDistanceCheck = now;
    checkDistance();
  }

  if (WiFi.status() != WL_CONNECTED) return;

  if (sendWanted && now - lastAlertSend >= ALERT_GAP_MS) {
    sendWanted = false;
    lastAlertSend = now;
    lastReport = now;
    sendReading();
  } else if (now - lastReport >= REPORT_MS) {
    lastReport = now;
    sendReading();
  }
}

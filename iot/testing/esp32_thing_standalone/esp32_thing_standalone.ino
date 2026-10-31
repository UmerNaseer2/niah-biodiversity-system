/*
  ESP32 Thing Node
  Board  : ESP32 Dev Module
  Core   : esp32 by Espressif Systems 3.3.12
  Library: <DHT.h> by Adafruit
  Serial : 115200 baud

  Applications
    DHT11      -> air temperature and humidity
    Soil probe -> flash flooding (saturated soil) / soil drying (erosion risk)
    Rain pad   -> rain detection
    HC-SR04    -> node status (if the node dropped)
    Buzzer     -> asset tracking (beeps every 5 s so the node can be found)

  Wiring (expansion board header: G = GND, V = supply, S = signal)
    Device        Pin        Board header
    DHT11         +          D21 (V)       voltage jumper on 3.3 V
                  OUT        D21 (S)
                  -          D21 (G)
    Soil probe    AO         VP/36 (S)
                  VCC        D17 (S)       switched: powered only while sampling
                  GND        VP/36 (G)
    Rain pad      AO         VN/39 (S)
                  VCC        D19 (S)       switched: powered only while sampling
                  GND        VN/39 (G)
    HC-SR04       VCC        5V pin
                  Trig       D5 (S)
                  Echo       D16 (S)       (recommended: via 1k/2k divider)
                  GND        D16 (G)
    Buzzer        +          D23 (S)       buzzer
                  -          D23 (G)
*/

#include <DHT.h>

// pin map
#define DHT_PIN        21
#define SOIL_AO_PIN    36   // VP, ADC1
#define SOIL_PWR_PIN   17
#define RAIN_AO_PIN    39   // VN, ADC1
#define RAIN_PWR_PIN   19
#define US_TRIG_PIN     5
#define US_ECHO_PIN    16
#define BUZZER_PIN     23

// timing
const uint32_t SAMPLE_MS   = 5000;  // read all sensors every 5 s
const uint32_t BEEP_MS     = 5000;  // asset-tracking beep every 5 s
const uint16_t BEEP_HZ     = 2000;  // buzzer tone
const uint16_t BEEP_LEN_MS = 150;   // duration

// calibration (tune)
// Soil: raw ADC reading with the probe in dry air, and in water / saturated soil
const int SOIL_DRY_RAW = 4095;
const int SOIL_WET_RAW = 1400;
const int SOIL_FLOOD_PCT = 85;  // at or above: saturated -> flash-flood risk
const int SOIL_DRY_PCT   = 20;  // at or below: drying -> erosion risk

// Rain pad: raw reading with the pad dry, and fully wet
const int RAIN_DRY_RAW = 4095;
const int RAIN_WET_RAW = 1500;
const int RAIN_LIGHT_PCT = 20;
const int RAIN_HEAVY_PCT = 60;

// Ultrasonic
const float US_MOVE_CM = 10.0;              // how far from initial position should considered moved           
const unsigned long US_TIMEOUT = 30000;  // ~5 m round trip max

// globals
DHT dht(DHT_PIN, DHT11);
uint32_t lastSample = 0, lastBeep = 0;
float usBaseline = -1;

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

void sampleAll() {
  Serial.printf("\n---- (t = %lu s) ----\n", (unsigned long)(millis() / 1000));

  // DHT11: temperature and humidity
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (isnan(h) || isnan(t)) Serial.println("Temp/Hum : read FAILED (check DHT11 wiring)");
  else Serial.printf("Temp/Hum : %.1f C   %.0f %%RH\n", t, h);

  // Soil moisture: flooding / drying
  int soilRaw = readSwitchedSensor(SOIL_PWR_PIN, SOIL_AO_PIN);
  int soilPct = rawToPercent(soilRaw, SOIL_DRY_RAW, SOIL_WET_RAW);
  const char* soilState = soilPct >= SOIL_FLOOD_PCT ? "SATURATED - flash flood risk"
  : soilPct <= SOIL_DRY_PCT ? "DRY - erosion risk"
  : "NORMAL";
  Serial.printf("Soil: raw %4d  -> %3d %%   [%s]\n", soilRaw, soilPct, soilState);

  // Rain
  int rainRaw = readSwitchedSensor(RAIN_PWR_PIN, RAIN_AO_PIN);
  int rainPct = rawToPercent(rainRaw, RAIN_DRY_RAW, RAIN_WET_RAW);
  const char* rainState = rainPct >= RAIN_HEAVY_PCT ? "HEAVY RAIN"
  : rainPct >= RAIN_LIGHT_PCT ? "RAIN"
  : "NO RAIN";
  Serial.printf("Rain: raw %4d  -> %3d %%   [%s]\n", rainRaw, rainPct, rainState);

  // Ultrasonic: node status
  float d = readDistanceCm();
  if (d < 0) {
    Serial.println("Distance : no echo   [CHECK NODE - sensor blocked, tilted or out of range]");
  } else {
    if (usBaseline < 0) usBaseline = d;   // first good reading becomes the reference
    float delta = d - usBaseline;
    bool moved = fabs(delta) > US_MOVE_CM;
    Serial.printf("Distance : %.1f cm  (baseline %.1f, change %+.1f)   [%s]\n", d, usBaseline, delta, moved ? "NODE MOVED / OBSTRUCTED" : "NODE OK");
  }
}


void setup() {
  Serial.begin(115200);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db); // 0 - ~3.1 V input range

  pinMode(SOIL_PWR_PIN, OUTPUT);  digitalWrite(SOIL_PWR_PIN, LOW);
  pinMode(RAIN_PWR_PIN, OUTPUT);  digitalWrite(RAIN_PWR_PIN, LOW);
  pinMode(US_TRIG_PIN, OUTPUT);   digitalWrite(US_TRIG_PIN, LOW);
  pinMode(US_ECHO_PIN, INPUT);

  dht.begin();
  delay(2000);  // DHT11 needs ~1-2 s after power-up

  Serial.println("\nESP32 field node started");
  lastSample = millis() - SAMPLE_MS;  // take the first sample immediately
  lastBeep   = millis() - BEEP_MS;
}

void loop() {
  uint32_t now = millis();

  if (now - lastSample >= SAMPLE_MS) {
    lastSample = now;
    sampleAll();
  }

  if (now - lastBeep >= BEEP_MS) {
    lastBeep = now;
    tone(BUZZER_PIN, BEEP_HZ, BEEP_LEN_MS); // non-blocking short beep
  }
}

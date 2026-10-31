/*
 * This ESP32 code is created by esp32io.com
 *
 * This ESP32 code is released in the public domain
 *
 * For more detail (instruction and wiring diagram), visit https://esp32io.com/tutorials/esp32-rain-sensor
 */

#define POWER_PIN 19  // ESP32's pin GPIO19 that provides the power to the rain sensor
#define DO_PIN 18     // ESP32's pin GPIO21 connected to DO pin of the rain sensor

void setup() {
  // initialize serial communication
  Serial.begin(9600);
  // initialize the Arduino's pin as an input
  pinMode(POWER_PIN, OUTPUT);  // configure the power pin pin as an OUTPUT
  pinMode(DO_PIN, INPUT);
}

void loop() {
  digitalWrite(POWER_PIN, HIGH);  // turn the rain sensor's power  ON
  delay(50);                      // wait 10 milliseconds

  int rain_state = digitalRead(DO_PIN);

  digitalWrite(POWER_PIN, LOW);  // turn the rain sensor's power OFF

  if (rain_state == HIGH)
    Serial.println("The rain is NOT detected");
  else
    Serial.println("The rain is detected");

  delay(1000);  // pause for 1 sec to avoid reading sensors frequently to prolong the sensor lifetime
}

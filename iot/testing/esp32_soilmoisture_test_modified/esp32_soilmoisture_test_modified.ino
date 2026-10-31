/*
  ESP32 Soil Moisture Sensor
  modified to power only when sampling
*/
#define POWER_PIN  17 // ESP32 pin GPIO17 connected to sensor's VCC pin
#define SIGNAL_PIN 36 // ESP32 pin GPIO36 (ADC1) connected to sensor's signal pin

int moistureValue,sensorValue;

void setup(void){
  Serial.begin(9600);
  // set the ADC attenuation to 11 dB (up to ~3.3V input)
  analogSetAttenuation(ADC_11db);
  pinMode(POWER_PIN, OUTPUT);   // configure pin as an OUTPUT
  digitalWrite(POWER_PIN, LOW); // turn the sensor OFF
}

void loop(void){
  digitalWrite(POWER_PIN, HIGH);  // turn the sensor ON
  delay(50);                      // wait 50 milliseconds
  sensorValue = analogRead(SIGNAL_PIN); // read the analog value from sensor
  digitalWrite(POWER_PIN, LOW);   // turn the sensor OFF
  moistureValue = ( 100 - ( (sensorValue/4095.00) * 100 ) );
  Serial.print("Moisture = ");
  Serial.print(moistureValue);  /* Print on the serial window */
  Serial.println("%");
  delay(1000);              /* Wait for 1000mS */
}

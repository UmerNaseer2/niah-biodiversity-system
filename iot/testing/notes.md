testing: not used in production, only for debugging purpose

ESP32

Arduino IDE



how to attach expansion board and use esp32 with some intro info to use with arduino ide

https://randomnerdtutorials.com/getting-started-with-esp32/



preferences -> additional board url -> add (, ) **https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package\_esp32\_index.json**

original url = **https://github.com/earlephilhower/arduino-pico/releases/download/global/package\_rp2040\_index.json**



ps: you dont have add the url if can find the following in board manager



Tools > Board > Boards Manager -> install esp32 by Espressif Systems (latest version) (about 10-20min with decent wifi)



Tools > Board > ESP32 > esp32 dev module



testing the esp32

go to file -> example -> chipID (esp32) -> GetChipID

example output on terminal:

ESP32 Chip model = ESP32-D0WD-V3 Rev 301

This chip has 2 cores

Chip ID: 16062768



extra: wifi feature (omitted results)

go to file -> example -> wifi (esp32 dev module) -> WifiScan



example

1 networks found

Nr | SSID                             | RSSI | CH | Encryption

&#x20;1 | .....................            |  ... |  . | ..........





Testing the components

https://esp32io.com/tutorials/esp32-dht11



wiring

DHT11	ESP32 Expansion board

\+	D21 (V)

OUT	D21 (S)

\- 	D21 (G)



https://www.electronicwings.com/esp32/soil-moisture-sensor-interfacing-with-esp32



wiring

soil moisture	ESP32 Expansion board

AO		VP/36 (S)

VCC		D17 (S)

GND 		VP/36 (G)

DO		none



note: if you dont have soil or water, you either use a sweaty/wet finger to cross the two prongs or use a wire to short circuit between the two prongs. pin 17 makes sure the sensor only receives power during sampling to avoid electrochemical reaction /faster decay due to constant current





https://esp32io.com/tutorials/esp32-rain-sensor

wiring

connect the raindrops module (L1A01) to a mh sensor series comparator in either way (non polarised)

water drop	ESP32 Expansion board

AO		VN/39 (S)

DO		D18 (S)

VCC		D19 (S)

GND 		VN/39 (G)



note: pin 19 makes sure the sensor only receives power during sampling to avoid electrochemical reaction /faster decay due to constant current. The rain can be emulated by spreading something conductive on the plate, for example your thumb or a wet cloth, note to clean the copper of your hand. need to adjust the screw potentiometer to make it more sensitive for DO. for application, between using DO and AO,



https://randomnerdtutorials.com/esp32-hc-sr04-ultrasonic-arduino/

wiring

HC-SR04		ESP32 Expansion board

VCC		5V

Trig		D5 (S)

Echo		D16 (S)

GND 		D16 (G)



note: echo needs a 1k/2k ohm voltage divider, so the pin sees about 3.3 V. The divider is required, not optional: the HC-SR04 echo pin puts out 5 V and the ESP32 pins are only rated for 3.3 V.





https://esp32io.com/tutorials/esp32-piezo-buzzer

Buzzer		ESP32 Expansion board

VCC		D23 (S)

GND 		D23 (G)


# IoT plant protection

Owners: Rukman, Bryan

Sensor nodes (ESP32 + sensors) send readings to an edge device in each forest region, which forwards them to Supabase.
See `docs/architecture/IoT Plant Protection - High-level design.png`.

Put each Arduino sketch in its own folder here, for example `iot/sensor-node/sensor-node.ino` and `iot/edge-device/edge-device.ino`.
Keep WiFi passwords and device credentials in a `secrets.h` file, which is gitignored. Commit a `secrets.example.h` instead.

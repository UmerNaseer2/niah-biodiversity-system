// Made-up readings shaped like what the ESP32 nodes will send once the IoT
// items (28 to 33) are built: DHT11 temperature and humidity (whole numbers,
// the DHT11 does not give decimals), soil moisture, PIR movement counts and
// battery level. Positions are made up like everything else.

export type Sensor = {
  id: string;
  plot: string;
  online: boolean;
  lastReading: string;
  tempC: number;
  humidity: number;
  soilMoisture: number;
  movementLastHour: number;
  battery: number;
  /** Hourly temperature, oldest first, up to the last reading */
  tempHistory: number[];
  position: { lat: number; lng: number };
};

export const sensors: Sensor[] = [
  {
    id: "S-01",
    plot: "Plot A",
    online: true,
    lastReading: "2026-10-04T09:02",
    tempC: 27,
    humidity: 88,
    soilMoisture: 46,
    movementLastHour: 0,
    battery: 81,
    tempHistory: [29, 30, 31, 31, 30, 29, 28, 27, 26, 26, 25, 25, 25, 24, 24, 24, 24, 24, 25, 25, 26, 26, 27, 27],
    position: { lat: 3.8172, lng: 113.7731 },
  },
  {
    id: "S-02",
    plot: "Plot B",
    online: false,
    lastReading: "2026-10-04T06:40",
    tempC: 24,
    humidity: 90,
    soilMoisture: 52,
    movementLastHour: 0,
    battery: 64,
    tempHistory: [28, 29, 30, 30, 29, 28, 27, 27, 26, 25, 25, 25, 24, 24, 24, 24, 24, 24, 24, 24, 24],
    position: { lat: 3.8203, lng: 113.7812 },
  },
  {
    id: "S-03",
    plot: "Plot C",
    online: true,
    lastReading: "2026-10-04T09:01",
    tempC: 26,
    humidity: 89,
    soilMoisture: 41,
    movementLastHour: 0,
    battery: 73,
    tempHistory: [28, 29, 30, 30, 30, 29, 28, 27, 26, 25, 25, 24, 24, 24, 24, 23, 23, 24, 24, 24, 25, 25, 26, 26],
    position: { lat: 3.8098, lng: 113.7724 },
  },
  {
    id: "S-04",
    plot: "Plot D",
    online: true,
    lastReading: "2026-10-04T09:03",
    tempC: 27,
    humidity: 86,
    soilMoisture: 38,
    movementLastHour: 0,
    battery: 92,
    tempHistory: [29, 30, 31, 32, 31, 30, 29, 28, 27, 26, 26, 25, 25, 25, 25, 24, 24, 25, 25, 25, 26, 26, 27, 27],
    position: { lat: 3.8087, lng: 113.7838 },
  },
  {
    id: "S-05",
    plot: "Plot E",
    online: true,
    lastReading: "2026-10-04T09:00",
    tempC: 28,
    humidity: 84,
    soilMoisture: 33,
    movementLastHour: 1,
    battery: 12,
    tempHistory: [30, 31, 31, 32, 31, 30, 29, 28, 27, 27, 26, 26, 25, 25, 25, 25, 25, 25, 25, 26, 26, 27, 27, 28],
    position: { lat: 3.8149, lng: 113.7849 },
  },
];

export type SensorAlert = {
  id: string;
  sensorId: string;
  level: "urgent" | "routine";
  title: string;
  detail: string;
  at: string;
};

export const sensorAlerts: SensorAlert[] = [
  {
    id: "alert-movement-s03",
    sensorId: "S-03",
    level: "urgent",
    title: "Movement near S-03 at night",
    detail:
      "The movement sensor went off 4 times between 2:14 am and 2:31 am. Movement at night can mean people in the plot, so the next patrol should check it.",
    at: "2026-10-04T02:14",
  },
  {
    id: "alert-battery-s05",
    sensorId: "S-05",
    level: "routine",
    title: "S-05 battery at 12%",
    detail: "At the current rate it runs out in about 2 days. Swap the battery on the next patrol.",
    at: "2026-10-04T07:30",
  },
  {
    id: "alert-offline-s02",
    sensorId: "S-02",
    level: "routine",
    title: "S-02 is offline",
    detail: "No readings since 6:40 am. It could be a flat battery or a lost connection.",
    at: "2026-10-04T06:40",
  },
];

import { tagCodeFor } from '@/lib/id';
import type { GpsReading, PlantRecord } from '@/types/plant-record';

// All mock coordinates are made-up points scattered around the park HQ at Pangkalan Lubang.
// They are not where any of these plants actually grow. Real locations of protected species
// must never go into test data, screenshots or anything public.
const PARK_HQ = { latitude: 3.8141, longitude: 113.7787 };

const now = new Date();

/** A time earlier today, so the Home count always has something in it. */
function earlierToday(minutesAgo: number) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const time = Math.max(now.getTime() - minutesAgo * 60_000, startOfToday.getTime());
  return new Date(time).toISOString();
}

function daysAgo(days: number, hours: number, minutes: number) {
  const date = new Date(now);
  date.setDate(now.getDate() - days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

type MockInput = Omit<PlantRecord, 'tagCode' | 'location'> & {
  gps?: Omit<GpsReading, 'capturedAt'>;
};

function mock({ gps, ...record }: MockInput): PlantRecord {
  return {
    ...record,
    tagCode: tagCodeFor(record.id),
    location: gps ? { ...gps, capturedAt: record.recordedAt } : undefined,
  };
}

/** Fake GPS fix for the New Record screen until item 8 brings in expo-location. */
export function mockGpsReading(): GpsReading {
  return {
    latitude: PARK_HQ.latitude + (Math.random() - 0.5) * 0.01,
    longitude: PARK_HQ.longitude + (Math.random() - 0.5) * 0.01,
    accuracyM: Math.round(4 + Math.random() * 31),
    capturedAt: new Date().toISOString(),
  };
}

export const MOCK_RECORDS: PlantRecord[] = [
  mock({
    id: '3f2a9c4e-8b1d-4c6a-9e2f-7a1b5c3d9e01',
    speciesName: 'Eusideroxylon zwageri',
    commonName: 'Belian',
    heightM: 18.5,
    condition: 'healthy',
    photoCount: 2,
    recordedAt: earlierToday(25),
    syncStatus: 'pending',
    gps: { latitude: 3.81488, longitude: 113.77968, accuracyM: 6 },
  }),
  mock({
    id: '8c41e7b2-5d3f-4a9e-b6c1-2e8f4a7d1c02',
    speciesName: 'Nepenthes ampullaria',
    commonName: 'Pitcher plant',
    heightM: 0.4,
    condition: 'healthy',
    photoCount: 3,
    recordedAt: earlierToday(70),
    syncStatus: 'pending',
    gps: { latitude: 3.81655, longitude: 113.77514, accuracyM: 12 },
  }),
  mock({
    id: 'b17d03f9-2c6e-4f8a-a3d5-9e1c7b4f2a03',
    speciesName: 'Koompassia excelsa',
    commonName: 'Tapang',
    heightM: 52,
    condition: 'healthy',
    photoCount: 1,
    recordedAt: earlierToday(180),
    syncStatus: 'synced',
    gps: { latitude: 3.81188, longitude: 113.78203, accuracyM: 9 },
  }),
  mock({
    id: '5e9a2c71-7f4b-4d2e-8c9a-3b6d1e5f7a04',
    speciesName: 'Shorea macrophylla',
    commonName: 'Engkabang',
    heightM: 24,
    condition: 'damaged',
    notes: 'Bark damage on the north side.',
    photoCount: 0,
    recordedAt: daysAgo(1, 15, 20),
    syncStatus: 'synced',
    gps: { latitude: 3.81873, longitude: 113.77942, accuracyM: 14 },
  }),
  mock({
    id: '72c5f8a0-3e1d-4b9c-9f6a-8d2e4c1b7a06',
    speciesName: 'Durio graveolens',
    commonName: 'Durian kuning',
    heightM: 15,
    condition: 'diseased',
    notes: 'Leaf spots on lower branches.',
    photoCount: 0,
    recordedAt: daysAgo(1, 11, 40),
    syncStatus: 'pending',
  }),
  mock({
    id: 'd4b86e13-9a2c-4e7f-b1d8-6c3a9f2e5b05',
    speciesName: 'Dryobalanops aromatica',
    commonName: 'Kapur',
    heightM: 35,
    condition: 'healthy',
    photoCount: 0,
    recordedAt: daysAgo(2, 10, 5),
    syncStatus: 'synced',
    gps: { latitude: 3.80967, longitude: 113.77655, accuracyM: 8 },
  }),
];

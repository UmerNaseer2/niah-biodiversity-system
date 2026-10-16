import { deleteDatabaseAsync } from 'expo-sqlite';

import { DATABASE_NAME } from '@/db/database';
import { openRecordsStore, type RecordsStore } from '@/db/records-store';
import type { GpsReading, PlantRecord } from '@/types/plant-record';

// A record with every field filled in. The location is a made up point near the park HQ.
const full: PlantRecord = {
  id: '6b1e4d2a-7c3f-4e8b-9a5d-1f2e3c4b5a60',
  tagCode: 'NNP-6B1E4D',
  speciesName: 'Shorea macrophylla',
  speciesSlug: 'shorea-macrophylla',
  commonName: 'Engkabang',
  heightM: 12.5,
  condition: 'diseased',
  notes: 'Fungus on the lower trunk',
  location: {
    latitude: 3.81391,
    longitude: 113.77874,
    accuracyM: 6,
    capturedAt: '2026-10-16T01:12:45.000Z',
  },
  photoCount: 0,
  recordedAt: '2026-10-16T01:13:02.000Z',
  syncStatus: 'pending',
};

// A record with only the fields that have to be there.
const bare: PlantRecord = {
  id: 'c2d4f6a8-1b3d-4f5a-8c7e-9a0b1c2d3e40',
  tagCode: 'NNP-C2D4F6',
  speciesName: 'Ficus sp.',
  condition: 'healthy',
  photoCount: 0,
  recordedAt: '2026-10-16T00:40:00.000Z',
  syncStatus: 'synced',
};

function withId(record: PlantRecord, id: string): PlantRecord {
  return { ...record, id, tagCode: `NNP-${id.slice(0, 6).toUpperCase()}` };
}

let store: RecordsStore;

beforeEach(async () => {
  await deleteDatabaseAsync(DATABASE_NAME);
  store = await openRecordsStore();
});

afterEach(async () => {
  await store.close();
});

describe('records store', () => {
  it('gives back a record with every field the way it was saved', async () => {
    await store.saveRecord(full);
    expect(await store.loadRecords()).toEqual([full]);
  });

  it('gives back empty fields as missing, not as null', async () => {
    await store.saveRecord(bare);
    const [loaded] = await store.loadRecords();
    expect(loaded).toEqual(bare);
    expect(Object.values(loaded)).not.toContain(null);
    expect(loaded.location).toBeUndefined();
  });

  it('lists the newest first, and the later save first when the times match', async () => {
    const older = withId(bare, '11111111-0000-4000-8000-000000000001');
    const newer = withId(full, '22222222-0000-4000-8000-000000000002');
    const sameTime = withId(full, '33333333-0000-4000-8000-000000000003');
    await store.saveRecord(older);
    await store.saveRecord(newer);
    await store.saveRecord(sameTime);

    const loaded = await store.loadRecords();
    expect(loaded.map((record) => record.id)).toEqual([sameTime.id, newer.id, older.id]);
  });

  it('turns down a second record with the same ID or tag code', async () => {
    await store.saveRecord(full);
    await expect(store.saveRecord({ ...bare, id: full.id })).rejects.toThrow(
      'UNIQUE constraint failed: plant_records.id',
    );
    await expect(store.saveRecord({ ...bare, tagCode: full.tagCode })).rejects.toThrow(
      'UNIQUE constraint failed: plant_records.tag_code',
    );
    expect(await store.loadRecords()).toEqual([full]);
  });

  // The app never makes records like these, but if a bug ever did, the table stops them before
  // the upload in item 10 has to deal with them.
  it.each<[string, Partial<PlantRecord>]>([
    ['an empty species name', { speciesName: '' }],
    ['a condition that is not on the list', { condition: 'burnt' as PlantRecord['condition'] }],
    ['a height of 0', { heightM: 0 }],
    ['a latitude past the pole', { location: { ...full.location!, latitude: 91 } }],
    ['a longitude past 180', { location: { ...full.location!, longitude: 181 } }],
    ['a negative accuracy', { location: { ...full.location!, accuracyM: -1 } }],
    [
      'half a location',
      { location: { latitude: 3.81391, longitude: 113.77874 } as unknown as GpsReading },
    ],
    ['a negative photo count', { photoCount: -1 }],
    ['an upload state that is not on the list', { syncStatus: 'sending' as 'pending' }],
  ])('turns down a record with %s', async (_what, change) => {
    await expect(store.saveRecord({ ...full, ...change })).rejects.toThrow(
      'CHECK constraint failed',
    );
    expect(await store.loadRecords()).toEqual([]);
  });

  it('still has the records after it is closed and opened again', async () => {
    await store.saveRecord(full);
    await store.saveRecord(bare);
    await store.close();

    store = await openRecordsStore();
    expect(await store.loadRecords()).toEqual([full, bare]);
  });
});

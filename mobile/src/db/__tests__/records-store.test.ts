import { deleteDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

import type { SpeciesOption } from '@/data/species-list';
import { DATABASE_NAME } from '@/db/database';
import {
  EMPTY_SPECIES_LIST,
  NO_SUCH_RECORD,
  openRecordsStore,
  SPECIES_TRIES,
  type RecordsStore,
} from '@/db/records-store';
import type { GpsReading, PlantRecord, UploadProblem } from '@/types/plant-record';

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

// Two species the way the download in item 10 will hand them over. Names only.
const belian: SpeciesOption = {
  slug: 'eusideroxylon-zwageri',
  scientificName: 'Eusideroxylon zwageri',
  commonNames: ['Belian', 'Borneo ironwood'],
};
const fig: SpeciesOption = {
  slug: 'ficus-benjamina',
  scientificName: 'Ficus benjamina',
  commonNames: [],
};

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

  it('gives back the upload problem on a record that is still waiting', async () => {
    const stuck: PlantRecord = { ...full, uploadProblem: 'tag-clash' };
    await store.saveRecord(stuck);
    expect(await store.loadRecords()).toEqual([stuck]);
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
    ['an upload problem that is not on the list', { uploadProblem: 'lost' as UploadProblem }],
    ['an upload problem on a synced record', { syncStatus: 'synced', uploadProblem: 'rejected' }],
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

describe('records waiting to sync', () => {
  const first = withId(full, '11111111-0000-4000-8000-000000000001');
  const second = withId(
    { ...full, recordedAt: '2026-10-16T02:00:00.000Z', uploadProblem: 'not-allowed' },
    '22222222-0000-4000-8000-000000000002',
  );
  const sameTime = withId(
    { ...full, recordedAt: '2026-10-16T02:00:00.000Z' },
    '33333333-0000-4000-8000-000000000003',
  );
  const synced = withId(bare, '44444444-0000-4000-8000-000000000004');

  beforeEach(async () => {
    // Saved out of order, so the list can't just come back in the order they went in.
    await store.saveRecord(second);
    await store.saveRecord(synced);
    await store.saveRecord(sameTime);
    await store.saveRecord(first);
  });

  it('lists the oldest first, problems and all, and none that are synced', async () => {
    const waiting = await store.loadWaiting();
    expect(waiting.map((record) => record.id)).toEqual([first.id, second.id, sameTime.id]);
    expect(waiting[1]).toEqual(second);
  });

  it('marks a record as synced and clears its problem', async () => {
    await store.saveUploadOutcome(second.id, { kind: 'synced' });
    expect((await store.loadWaiting()).map((record) => record.id)).toEqual([
      first.id,
      sameTime.id,
    ]);
    const saved = (await store.loadRecords()).find((record) => record.id === second.id);
    expect(saved).toEqual({ ...second, syncStatus: 'synced', uploadProblem: undefined });
  });

  it('keeps a record waiting with its problem, and swaps an older problem out', async () => {
    await store.saveUploadOutcome(first.id, { kind: 'problem', problem: 'tag-clash' });
    await store.saveUploadOutcome(second.id, { kind: 'problem', problem: 'rejected' });
    const waiting = await store.loadWaiting();
    expect(waiting.map((record) => record.uploadProblem)).toEqual([
      'tag-clash',
      'rejected',
      undefined,
    ]);
  });

  it('changes nothing when the record should be tried again', async () => {
    const before = await store.loadRecords();
    await store.saveUploadOutcome(first.id, { kind: 'retry' });
    await store.saveUploadOutcome(second.id, { kind: 'retry' });
    expect(await store.loadRecords()).toEqual(before);
  });

  it("won't give a synced record a problem", async () => {
    await expect(
      store.saveUploadOutcome(synced.id, { kind: 'problem', problem: 'rejected' }),
    ).rejects.toThrow('CHECK constraint failed');
  });

  it('says so when no record has that ID', async () => {
    const missing = '99999999-0000-4000-8000-000000000009';
    await expect(store.saveUploadOutcome(missing, { kind: 'synced' })).rejects.toThrow(
      NO_SUCH_RECORD,
    );
    await expect(
      store.saveUploadOutcome(missing, { kind: 'problem', problem: 'rejected' }),
    ).rejects.toThrow(NO_SUCH_RECORD);
  });

  it('remembers the outcome after it is closed and opened again', async () => {
    await store.saveUploadOutcome(first.id, { kind: 'synced' });
    await store.saveUploadOutcome(sameTime.id, { kind: 'problem', problem: 'tag-clash' });
    await store.close();

    store = await openRecordsStore();
    const waiting = await store.loadWaiting();
    expect(waiting.map((record) => [record.id, record.uploadProblem])).toEqual([
      [second.id, 'not-allowed'],
      [sameTime.id, 'tag-clash'],
    ]);
  });
});

describe('species list', () => {
  it('has no species until the first download', async () => {
    expect(await store.loadSpecies()).toEqual([]);
  });

  it('gives back the list in the order it came down', async () => {
    await store.replaceSpecies([fig, belian]);
    expect(await store.loadSpecies()).toEqual([fig, belian]);
  });

  it('swaps the whole list for the new one', async () => {
    await store.replaceSpecies([fig, belian]);
    await store.replaceSpecies([belian]);
    expect(await store.loadSpecies()).toEqual([belian]);
  });

  it.each<[string, SpeciesOption[], string]>([
    ['the same slug twice', [belian, fig, belian], 'UNIQUE constraint failed: species.slug'],
    ['an empty slug', [fig, { ...belian, slug: '' }], 'CHECK constraint failed'],
    ['an empty scientific name', [fig, { ...belian, scientificName: '' }], 'CHECK constraint'],
  ])('keeps the old list when the new one has %s', async (_what, list, error) => {
    await store.replaceSpecies([belian]);
    await expect(store.replaceSpecies(list)).rejects.toThrow(error);
    expect(await store.loadSpecies()).toEqual([belian]);
  });

  it('keeps the old list when the new one is empty', async () => {
    await store.replaceSpecies([belian]);
    await expect(store.replaceSpecies([])).rejects.toThrow(EMPTY_SPECIES_LIST);
    expect(await store.loadSpecies()).toEqual([belian]);
  });

  it('tells the connection it writes on to wait when the database is busy', async () => {
    const exec = jest.spyOn(SQLiteDatabase.prototype, 'execAsync');
    try {
      await store.replaceSpecies([belian]);
      // BEGIN comes first, but it doesn't lock anything, so the wait is set before the DELETE.
      expect(exec.mock.calls.map(([source]) => source)).toEqual([
        'BEGIN',
        'PRAGMA busy_timeout = 5000',
        'COMMIT',
      ]);
    } finally {
      exec.mockRestore();
    }
  });

  it('tries again when the database is busy', async () => {
    await store.replaceSpecies([belian]);
    // The message the phone gives when a record is being saved on the other connection.
    const busy = new Error(
      "Call to function 'NativeStatement.runAsync' has been rejected.\n" +
        '→ Caused by: Error code 5: database is locked',
    );
    const run = jest.spyOn(SQLiteDatabase.prototype, 'runAsync').mockRejectedValueOnce(busy);
    try {
      await store.replaceSpecies([fig, belian]);
      expect(await store.loadSpecies()).toEqual([fig, belian]);
    } finally {
      run.mockRestore();
    }
  });

  it('gives up and keeps the old list when the database stays busy', async () => {
    await store.replaceSpecies([belian]);
    const busy = new Error('Error code 5: database is locked');
    const run = jest.spyOn(SQLiteDatabase.prototype, 'runAsync');
    for (let i = 0; i < SPECIES_TRIES; i++) {
      run.mockRejectedValueOnce(busy);
    }
    try {
      await expect(store.replaceSpecies([fig])).rejects.toThrow(busy);
      // Only the DELETE at the start of each try, since each one failed straight away.
      expect(run).toHaveBeenCalledTimes(SPECIES_TRIES);
    } finally {
      run.mockRestore();
    }
    expect(await store.loadSpecies()).toEqual([belian]);
  });

  it("doesn't try again when the list itself is the problem", async () => {
    const transaction = jest.spyOn(SQLiteDatabase.prototype, 'withExclusiveTransactionAsync');
    try {
      await expect(store.replaceSpecies([belian, belian])).rejects.toThrow('UNIQUE constraint');
      expect(transaction).toHaveBeenCalledTimes(1);
    } finally {
      transaction.mockRestore();
    }
  });

  it('still has the list after it is closed and opened again', async () => {
    await store.replaceSpecies([fig, belian]);
    await store.close();

    store = await openRecordsStore();
    expect(await store.loadSpecies()).toEqual([fig, belian]);
  });
});

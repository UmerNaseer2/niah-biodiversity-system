import type { SpeciesOption } from '@/data/species-list';
import {
  EMPTY_SPECIES_LIST,
  NOT_DELETED,
  NOT_TAG_CLASH,
  type RecordsStore,
} from '@/db/records-store';
import { openRecordsStore } from '@/db/records-store.web';
import type { PlantRecord } from '@/types/plant-record';

// The web build keeps records in memory, but it's meant to follow the same rules as the tables on
// the phone. These go through the same rules as records-store.test.ts.

const older: PlantRecord = {
  id: '6b1e4d2a-7c3f-4e8b-9a5d-1f2e3c4b5a60',
  tagCode: 'NNP-6B1E4D',
  speciesName: 'Shorea macrophylla',
  condition: 'healthy',
  photoCount: 0,
  recordedAt: '2026-10-16T01:13:02.000Z',
  syncStatus: 'pending',
};
const newer: PlantRecord = {
  ...older,
  id: 'c2d4f6a8-1b3d-4f5a-8c7e-9a0b1c2d3e40',
  tagCode: 'NNP-C2D4F6',
  recordedAt: '2026-10-16T02:00:00.000Z',
};
const onServer: PlantRecord = {
  ...older,
  id: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  tagCode: 'NNP-A1B2C3',
  recordedAt: '2026-10-16T03:00:00.000Z',
  syncStatus: 'synced',
};

const belian: SpeciesOption = {
  slug: 'eusideroxylon-zwageri',
  scientificName: 'Eusideroxylon zwageri',
  commonNames: ['Belian'],
};
const fig: SpeciesOption = {
  slug: 'ficus-benjamina',
  scientificName: 'Ficus benjamina',
  commonNames: [],
};

const ids = (records: PlantRecord[]) => records.map((record) => record.id);

let store: RecordsStore;

beforeEach(async () => {
  store = await openRecordsStore();
});

describe('records', () => {
  it('starts empty each time it opens, since nothing is kept', async () => {
    await store.saveRecord(older);
    const reloaded = await openRecordsStore();
    expect(await reloaded.loadRecords()).toEqual([]);
  });

  it('lists the newest first', async () => {
    await store.saveRecord(older);
    await store.saveRecord(newer);
    expect(ids(await store.loadRecords())).toEqual([newer.id, older.id]);
  });

  it('hands out a copy, so changing the list changes nothing saved', async () => {
    await store.saveRecord(older);
    (await store.loadRecords()).pop();
    expect(ids(await store.loadRecords())).toEqual([older.id]);
  });

  it('turns down a repeated ID or tag code', async () => {
    await store.saveRecord(older);
    await expect(store.saveRecord({ ...newer, id: older.id })).rejects.toThrow(/already saved/);
    await expect(store.saveRecord({ ...newer, tagCode: older.tagCode })).rejects.toThrow(
      /already saved/,
    );
    expect(ids(await store.loadRecords())).toEqual([older.id]);
  });

  it('only waits on records that are not on the server, oldest first', async () => {
    await store.saveRecord(older);
    await store.saveRecord(newer);
    await store.saveRecord(onServer);
    expect(ids(await store.loadWaiting())).toEqual([older.id, newer.id]);
  });
});

describe('upload outcomes', () => {
  beforeEach(async () => {
    await store.saveRecord(older);
    await store.saveRecord(onServer);
  });

  const saved = async (id: string) => (await store.loadRecords()).find((r) => r.id === id);

  it('marks a record as on the server and clears its problem', async () => {
    await store.saveUploadOutcome(older.id, { kind: 'problem', problem: 'tag-clash' });
    await store.saveUploadOutcome(older.id, { kind: 'synced' });
    expect(await saved(older.id)).toMatchObject({ syncStatus: 'synced' });
    expect((await saved(older.id))?.uploadProblem).toBeUndefined();
  });

  it('keeps a record waiting when it has a problem', async () => {
    await store.saveUploadOutcome(older.id, { kind: 'problem', problem: 'deleted' });
    expect(await saved(older.id)).toMatchObject({
      syncStatus: 'pending',
      uploadProblem: 'deleted',
    });
    expect(ids(await store.loadWaiting())).toEqual([older.id]);
  });

  it('leaves an earlier problem in place when it should be tried again', async () => {
    await store.saveUploadOutcome(older.id, { kind: 'problem', problem: 'rejected' });
    await store.saveUploadOutcome(older.id, { kind: 'retry' });
    expect(await saved(older.id)).toMatchObject({ uploadProblem: 'rejected' });
  });

  it('turns down a problem on a record already on the server', async () => {
    await expect(
      store.saveUploadOutcome(onServer.id, { kind: 'problem', problem: 'deleted' }),
    ).rejects.toThrow();
    expect((await saved(onServer.id))?.uploadProblem).toBeUndefined();
  });

  it('changes nothing when the record was removed while it was on its way', async () => {
    const before = await store.loadRecords();
    await store.saveUploadOutcome('no-such-id', { kind: 'synced' });
    await store.saveUploadOutcome('no-such-id', { kind: 'problem', problem: 'deleted' });
    expect(await store.loadRecords()).toEqual(before);
  });
});

describe('removing a deleted record', () => {
  beforeEach(async () => {
    await store.saveRecord(older);
    await store.saveRecord(newer);
    await store.saveRecord(onServer);
  });

  it('takes off the record an officer deleted and nothing else', async () => {
    await store.saveUploadOutcome(older.id, { kind: 'problem', problem: 'deleted' });
    await store.removeDeleted(older.id);
    expect(ids(await store.loadRecords())).toEqual([onServer.id, newer.id]);
  });

  it('turns down any other record, using the same message as the phone', async () => {
    await store.saveUploadOutcome(newer.id, { kind: 'problem', problem: 'not-allowed' });
    await expect(store.removeDeleted(older.id)).rejects.toThrow(NOT_DELETED);
    await expect(store.removeDeleted(newer.id)).rejects.toThrow(NOT_DELETED);
    await expect(store.removeDeleted(onServer.id)).rejects.toThrow(NOT_DELETED);
    await expect(store.removeDeleted('no-such-id')).rejects.toThrow(NOT_DELETED);
    expect(await store.loadRecords()).toHaveLength(3);
  });
});

describe('species list', () => {
  it('has no species until the first download', async () => {
    expect(await store.loadSpecies()).toEqual([]);
  });

  it('gives back the list in the order it came down, and swaps it for the next one', async () => {
    await store.replaceSpecies([fig, belian]);
    expect(await store.loadSpecies()).toEqual([fig, belian]);
    await store.replaceSpecies([belian]);
    expect(await store.loadSpecies()).toEqual([belian]);
  });

  it('keeps the old list when the download is empty, using the same message as the phone', async () => {
    await store.replaceSpecies([fig]);
    await expect(store.replaceSpecies([])).rejects.toThrow(EMPTY_SPECIES_LIST);
    expect(await store.loadSpecies()).toEqual([fig]);
  });

  it.each([
    ['a repeated slug', [fig, fig]],
    ['no slug', [{ ...fig, slug: '' }]],
    ['no name', [{ ...fig, scientificName: '' }]],
  ])('keeps the old list when a species has %s', async (_problem, list) => {
    await store.replaceSpecies([belian]);
    await expect(store.replaceSpecies(list)).rejects.toThrow();
    expect(await store.loadSpecies()).toEqual([belian]);
  });
});

describe('reading back what officers decided', () => {
  const synced = onServer;

  it('only lists the records that are on the server', async () => {
    await store.saveRecord(older);
    await store.saveRecord(synced);
    expect(await store.loadSyncedIds()).toEqual([synced.id]);
  });

  it('saves the decision and the reason on the record', async () => {
    await store.saveRecord(synced);
    await store.saveReviews([{ id: synced.id, status: 'rejected', notes: 'Wrong plant' }]);
    const [saved] = await store.loadRecords();
    expect(saved.reviewStatus).toBe('rejected');
    expect(saved.reviewNotes).toBe('Wrong plant');
    expect(saved.syncStatus).toBe('synced');
  });

  it('clears the reason once an officer approves it after all', async () => {
    await store.saveRecord(synced);
    await store.saveReviews([{ id: synced.id, status: 'rejected', notes: 'Wrong plant' }]);
    await store.saveReviews([{ id: synced.id, status: 'published', notes: null }]);
    const [saved] = await store.loadRecords();
    expect(saved.reviewStatus).toBe('published');
    expect(saved.reviewNotes).toBeUndefined();
  });

  it('ignores a record that is no longer on the phone, and an empty list', async () => {
    await store.saveRecord(synced);
    await store.saveReviews([{ id: 'not-here', status: 'rejected', notes: 'Wrong plant' }]);
    await store.saveReviews([]);
    const [saved] = await store.loadRecords();
    expect(saved.reviewStatus).toBeUndefined();
  });
});

describe('getting a new tag', () => {
  const NEW_ID = 'f0e1d2c3-b4a5-4968-8776-655443322110';

  async function clashing() {
    await store.saveRecord(older);
    await store.saveUploadOutcome(older.id, { kind: 'problem', problem: 'tag-clash' });
  }

  it('swaps the ID and tag code, clears the problem and keeps everything else', async () => {
    await clashing();
    await store.renewTag(older.id, NEW_ID, 'NNP-F0E1D2');
    const [saved] = await store.loadRecords();
    expect(saved).toEqual({ ...older, id: NEW_ID, tagCode: 'NNP-F0E1D2' });
  });

  it('only does it for a record with a tag clash', async () => {
    await store.saveRecord(older);
    await expect(store.renewTag(older.id, NEW_ID, 'NNP-F0E1D2')).rejects.toThrow(NOT_TAG_CLASH);
    await store.saveUploadOutcome(older.id, { kind: 'problem', problem: 'rejected' });
    await expect(store.renewTag(older.id, NEW_ID, 'NNP-F0E1D2')).rejects.toThrow(NOT_TAG_CLASH);
    await expect(store.renewTag('not-here', NEW_ID, 'NNP-F0E1D2')).rejects.toThrow(NOT_TAG_CLASH);
    const [saved] = await store.loadRecords();
    expect(saved.id).toBe(older.id);
  });
});

describe('when the phone last synced', () => {
  it('has no date until the first sync, then remembers the latest', async () => {
    expect(await store.loadLastSynced()).toBeNull();
    await store.saveLastSynced('2026-10-31T01:00:00.000Z');
    await store.saveLastSynced('2026-10-31T02:00:00.000Z');
    expect(await store.loadLastSynced()).toBe('2026-10-31T02:00:00.000Z');
  });
});

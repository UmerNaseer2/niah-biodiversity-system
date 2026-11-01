import type { SpeciesOption } from '@/data/species-list';
import type { RecordReview } from '@/db/records-store';
import {
  fetchAllPages,
  runSync,
  syncResultMessage,
  toReviews,
  toSpeciesOptions,
  type SessionCheck,
  type SyncApi,
  type SyncResult,
  type SyncStore,
} from '@/sync/sync-engine';
import type { PhotoUploadAnswer, UploadError, UploadOutcome, UploadRow } from '@/sync/upload-row';
import type { PhotoOutcome, PlantRecord, RecordPhoto, UploadProblem } from '@/types/plant-record';

// A fake phone and a fake server. Every answer comes from what supabase-js really gives back.

const ACCOUNT = 'aaaaaaaa-0000-4000-8000-000000000000';
const NO_SIGNAL = { error: { message: 'TypeError: Network request failed', code: '' }, status: 0 };
const OK = { error: null, status: 201 };
const NOT_ALLOWED = { error: { code: '42501', message: 'row-level security' }, status: 403 };
const EXPIRED = { error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 };
const SERVER_DOWN = { error: { code: 'XX000', message: 'internal error' }, status: 500 };
const taken = (constraint: string) => ({
  error: { code: '23505', message: `duplicate key value violates "${constraint}"` },
  status: 409,
});

function recordNamed(number: number, uploadProblem?: UploadProblem): PlantRecord {
  const id = `${String(number).padStart(8, '0')}-0000-4000-8000-000000000000`;
  return {
    id,
    tagCode: `NNP-${String(number).padStart(6, '0')}`,
    speciesName: 'Ficus sp.',
    condition: 'healthy',
    photoCount: 0,
    recordedAt: `2026-10-${String(number).padStart(2, '0')}T01:00:00.000Z`,
    syncStatus: 'pending',
    uploadProblem,
  };
}

function photoOf(record: PlantRecord, position: number, changes: Partial<RecordPhoto> = {}) {
  return {
    recordId: record.id,
    position,
    path: `record-photos/${record.id}-${position}.jpg`,
    ...changes,
  } satisfies RecordPhoto;
}

const belian: SpeciesOption = {
  slug: 'eusideroxylon-zwageri',
  scientificName: 'Eusideroxylon zwageri',
  commonNames: ['Belian'],
};

function fakePhone(waiting: PlantRecord[], syncedIds: string[] = [], photos: RecordPhoto[] = []) {
  const outcomes: [string, UploadOutcome][] = [];
  const photoOutcomes: [string, number, PhotoOutcome][] = [];
  const store = {
    loadWaiting: jest.fn(async () => waiting),
    saveUploadOutcome: jest.fn(async (id: string, outcome: UploadOutcome, _uploadedBy?: string) => {
      outcomes.push([id, outcome]);
    }),
    loadSyncedIds: jest.fn(async () => [
      ...syncedIds,
      ...outcomes.filter(([, outcome]) => outcome.kind === 'synced').map(([id]) => id),
    ]),
    saveReviews: jest.fn(async (_reviews: RecordReview[]) => {}),
    replaceSpecies: jest.fn(async (_list: SpeciesOption[]) => {}),
    saveLastSynced: jest.fn(async (_at: string) => {}),
    loadPhotosToUpload: jest.fn(async (_accountId: string) => photos),
    savePhotoOutcome: jest.fn(async (recordId: string, position: number, outcome: PhotoOutcome) => {
      photoOutcomes.push([recordId, position, outcome]);
    }),
  } satisfies SyncStore;
  return { store, outcomes, photoOutcomes };
}

type Answer = { error: UploadError | null; status: number };

function fakeServer(
  answers: Answer[] = [],
  sessions: SessionCheck[] = [],
  photoAnswers: PhotoUploadAnswer[] = [],
) {
  const sent: UploadRow[] = [];
  const photosSent: [string, string][] = [];
  const answerQueue = [...answers];
  const sessionQueue = [...sessions];
  const photoQueue = [...photoAnswers];
  const api = {
    session: jest.fn(async () => sessionQueue.shift() ?? 'ok'),
    accountId: jest.fn(async () => ACCOUNT as string | null),
    uploadPhoto: jest.fn(async (storagePath: string, localPath: string) => {
      photosSent.push([storagePath, localPath]);
      return photoQueue.shift() ?? 'uploaded';
    }),
    insertRecord: jest.fn(async (row: UploadRow) => {
      sent.push(row);
      return answerQueue.shift() ?? OK;
    }),
    fetchReviews: jest.fn(async (_ids: string[]) => [] as RecordReview[] | null),
    fetchSpecies: jest.fn(async () => [belian] as SpeciesOption[] | null),
  } satisfies SyncApi;
  return { api, sent, photosSent };
}

const automatic = { retryProblems: false };
const manual = { retryProblems: true };

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runSync: uploading', () => {
  it('uploads the oldest record first and marks each one synced', async () => {
    const records = [recordNamed(1), recordNamed(2), recordNamed(3)];
    const { store, outcomes } = fakePhone(records);
    const { api, sent } = fakeServer();

    const result = await runSync(api, store, automatic);

    expect(sent.map((row) => row.id)).toEqual(records.map((record) => record.id));
    expect(outcomes.map(([, outcome]) => outcome.kind)).toEqual(['synced', 'synced', 'synced']);
    expect(result).toMatchObject({ outcome: 'done', uploaded: 3, problems: 0, retryLater: 0 });
  });

  it('touches nothing when there is no signal to start with', async () => {
    const { store } = fakePhone([recordNamed(1)]);
    const { api } = fakeServer([], ['offline']);

    const result = await runSync(api, store, automatic);

    expect(result.outcome).toBe('offline');
    expect(store.loadWaiting).not.toHaveBeenCalled();
    expect(api.insertRecord).not.toHaveBeenCalled();
    expect(store.saveLastSynced).not.toHaveBeenCalled();
  });

  it("doesn't upload as the anon key when there's no session", async () => {
    const { store } = fakePhone([recordNamed(1)]);
    const { api } = fakeServer([], ['signed-out']);

    expect((await runSync(api, store, automatic)).outcome).toBe('signed-out');
    expect(api.insertRecord).not.toHaveBeenCalled();
  });

  it('stops, and blames nothing, if the session goes partway through', async () => {
    const { store, outcomes } = fakePhone([recordNamed(1), recordNamed(2)]);
    // One for the start, one for each upload.
    const { api } = fakeServer([], ['ok', 'ok', 'signed-out']);

    const result = await runSync(api, store, automatic);

    expect(result).toMatchObject({ outcome: 'signed-out', uploaded: 1 });
    expect(api.insertRecord).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
  });

  it('leaves a record waiting when signal drops during its upload', async () => {
    const { store, outcomes } = fakePhone([recordNamed(1), recordNamed(2), recordNamed(3)]);
    const { api } = fakeServer([OK, NO_SIGNAL]);

    const result = await runSync(api, store, automatic);

    expect(result).toMatchObject({ outcome: 'offline', uploaded: 1 });
    expect(outcomes).toHaveLength(1);
    expect(api.insertRecord).toHaveBeenCalledTimes(2);
    expect(store.saveLastSynced).not.toHaveBeenCalled();
  });

  it("doesn't blame the record when the server refuses the token", async () => {
    const { store, outcomes } = fakePhone([recordNamed(1)]);
    const { api } = fakeServer([EXPIRED]);

    expect((await runSync(api, store, automatic)).outcome).toBe('signed-out');
    expect(outcomes).toHaveLength(0);
  });

  it('stops at the first record when the account is not allowed to upload', async () => {
    const { store, outcomes } = fakePhone([recordNamed(1), recordNamed(2)]);
    const { api } = fakeServer([NOT_ALLOWED]);

    const result = await runSync(api, store, automatic);

    expect(result).toMatchObject({ outcome: 'not-allowed', problems: 1 });
    expect(api.insertRecord).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual([[recordNamed(1).id, { kind: 'problem', problem: 'not-allowed' }]]);
    expect(api.fetchSpecies).not.toHaveBeenCalled();
  });

  it('keeps going past one record the server turned down', async () => {
    const { store, outcomes } = fakePhone([recordNamed(1), recordNamed(2), recordNamed(3)]);
    const { api } = fakeServer([
      taken('records_tag_code_key'),
      { error: { code: '23514', message: 'check failed' }, status: 400 },
      OK,
    ]);

    const result = await runSync(api, store, automatic);

    expect(result).toMatchObject({ outcome: 'done', uploaded: 1, problems: 2 });
    expect(outcomes.map(([, outcome]) => outcome)).toEqual([
      { kind: 'problem', problem: 'tag-clash' },
      { kind: 'problem', problem: 'rejected' },
      { kind: 'synced' },
    ]);
  });

  it('counts a passing failure on the server as going again next time', async () => {
    const { store } = fakePhone([recordNamed(1), recordNamed(2)]);
    const { api } = fakeServer([SERVER_DOWN, OK]);

    const result = await runSync(api, store, automatic);

    expect(result).toMatchObject({ outcome: 'done', uploaded: 1, retryLater: 1, problems: 0 });
  });

  it('makes no duplicate when the answer to an upload got lost', async () => {
    // The server saved it but the answer never reached the phone.
    const record = recordNamed(1);
    const first = fakePhone([record]);
    const firstServer = fakeServer([NO_SIGNAL]);
    expect((await runSync(firstServer.api, first.store, automatic)).outcome).toBe('offline');
    expect(first.outcomes).toHaveLength(0);

    // So next time the server says it already has that ID, which means it worked.
    const second = fakePhone([record]);
    const secondServer = fakeServer([taken('records_pkey')]);
    const result = await runSync(secondServer.api, second.store, automatic);
    expect(result).toMatchObject({ outcome: 'done', uploaded: 1, problems: 0 });
    expect(second.outcomes).toEqual([[record.id, { kind: 'synced' }]]);
  });

  it('marks a record an officer deleted, and never counts it as uploaded', async () => {
    const { store, outcomes } = fakePhone([recordNamed(1)]);
    const { api } = fakeServer([taken('deleted_records_pkey')]);

    const result = await runSync(api, store, automatic);

    expect(result).toMatchObject({ uploaded: 0, problems: 1 });
    expect(outcomes[0][1]).toEqual({ kind: 'problem', problem: 'deleted' });
  });
});

describe('runSync: records with a problem', () => {
  it.each<UploadProblem>(['rejected', 'tag-clash', 'deleted'])(
    'an automatic sync leaves a %s record alone but still counts it',
    async (problem) => {
      const { store } = fakePhone([recordNamed(1, problem), recordNamed(2)]);
      const { api, sent } = fakeServer();

      const result = await runSync(api, store, automatic);

      expect(sent.map((row) => row.id)).toEqual([recordNamed(2).id]);
      expect(result).toMatchObject({ uploaded: 1, problems: 1 });
    },
  );

  it('an automatic sync tries not allowed again, because an admin may have fixed it', async () => {
    const { store } = fakePhone([recordNamed(1, 'not-allowed')]);
    const { api } = fakeServer();

    expect(await runSync(api, store, automatic)).toMatchObject({ outcome: 'done', uploaded: 1 });
  });

  it('pressing Sync now tries every record again', async () => {
    const { store, outcomes } = fakePhone([recordNamed(1, 'rejected'), recordNamed(2, 'deleted')]);
    const { api } = fakeServer();

    const result = await runSync(api, store, manual);

    expect(api.insertRecord).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ uploaded: 2, problems: 0 });
    expect(outcomes.map(([, outcome]) => outcome.kind)).toEqual(['synced', 'synced']);
  });
});

describe('runSync: photos', () => {
  const synced = recordNamed(1);

  it('sends each photo to the folder the website looks in, after every record', async () => {
    const waiting = recordNamed(2);
    const { store, outcomes, photoOutcomes } = fakePhone(
      [waiting],
      [],
      [photoOf(synced, 1), photoOf(synced, 2)],
    );
    const { api, photosSent } = fakeServer();
    jest.useFakeTimers({ now: new Date('2026-11-01T02:00:00.000Z') });

    const result = await runSync(api, store, automatic);
    jest.useRealTimers();

    expect(photosSent).toEqual([
      [`${ACCOUNT}/${synced.id}/1.jpg`, photoOf(synced, 1).path],
      [`${ACCOUNT}/${synced.id}/2.jpg`, photoOf(synced, 2).path],
    ]);
    expect(api.insertRecord.mock.invocationCallOrder[0]).toBeLessThan(
      api.uploadPhoto.mock.invocationCallOrder[0],
    );
    expect(outcomes[0][1].kind).toBe('synced');
    expect(photoOutcomes).toEqual([
      [synced.id, 1, { kind: 'uploaded', uploadedAt: '2026-11-01T02:00:00.000Z' }],
      [synced.id, 2, { kind: 'uploaded', uploadedAt: '2026-11-01T02:00:00.000Z' }],
    ]);
    expect(result).toMatchObject({ outcome: 'done', uploaded: 1, photosUploaded: 2 });
  });

  it('saves which account sent a record, because only it can send the photos', async () => {
    const { store } = fakePhone([synced]);
    const { api } = fakeServer();

    await runSync(api, store, automatic);

    expect(store.saveUploadOutcome).toHaveBeenCalledWith(
      synced.id,
      expect.objectContaining({ kind: 'synced' }),
      ACCOUNT,
    );
    expect(store.loadPhotosToUpload).toHaveBeenCalledWith(ACCOUNT);
  });

  it('checks the session before each photo, and not at all with no photos', async () => {
    const none = fakePhone([]);
    const noneServer = fakeServer();
    await runSync(noneServer.api, none.store, automatic);
    expect(noneServer.api.session).toHaveBeenCalledTimes(1);

    const two = fakePhone([], [], [photoOf(synced, 1), photoOf(synced, 2)]);
    const twoServer = fakeServer();
    await runSync(twoServer.api, two.store, automatic);
    expect(twoServer.api.session).toHaveBeenCalledTimes(3);
  });

  it('stops without marking anything when a session check says no signal', async () => {
    const { store, photoOutcomes } = fakePhone([], [], [photoOf(synced, 1)]);
    const { api } = fakeServer([], ['ok', 'offline']);

    const result = await runSync(api, store, automatic);

    expect(result.outcome).toBe('offline');
    expect(api.uploadPhoto).not.toHaveBeenCalled();
    expect(photoOutcomes).toEqual([]);
  });

  it.each(['offline', 'signed-out', 'not-allowed'] as const)(
    'stops at the first photo when the answer is %s, and leaves it to go up later',
    async (answer) => {
      const { store, photoOutcomes } = fakePhone([], [], [photoOf(synced, 1), photoOf(synced, 2)]);
      const { api } = fakeServer([], [], [answer]);

      const result = await runSync(api, store, automatic);

      expect(result.outcome).toBe(answer);
      expect(api.uploadPhoto).toHaveBeenCalledTimes(1);
      expect(photoOutcomes).toEqual([]);
      expect(api.fetchSpecies).not.toHaveBeenCalled();
    },
  );

  it('moves on from a server hiccup and tries that photo next time', async () => {
    const { store, photoOutcomes } = fakePhone([], [], [photoOf(synced, 1), photoOf(synced, 2)]);
    const { api } = fakeServer([], [], ['retry', 'uploaded']);

    const result = await runSync(api, store, automatic);

    expect(result).toMatchObject({ outcome: 'done', photosUploaded: 1, photosRetryLater: 1 });
    expect(photoOutcomes.map(([, position]) => position)).toEqual([2]);
  });

  it.each(['missing', 'rejected'] as const)(
    'keeps the reason when a photo comes back as %s, and carries on',
    async (answer) => {
      const { store, photoOutcomes } = fakePhone([], [], [photoOf(synced, 1), photoOf(synced, 2)]);
      const { api } = fakeServer([], [], [answer, 'uploaded']);

      const result = await runSync(api, store, automatic);

      expect(photoOutcomes[0]).toEqual([synced.id, 1, { kind: 'problem', problem: answer }]);
      expect(result).toMatchObject({ outcome: 'done', photosUploaded: 1, photoProblems: 1 });
    },
  );

  it('leaves a photo with a problem alone until someone presses Sync now', async () => {
    const stuck = photoOf(synced, 1, { problem: 'rejected' });

    const automaticRun = fakePhone([], [], [stuck]);
    const automaticServer = fakeServer();
    const left = await runSync(automaticServer.api, automaticRun.store, automatic);
    expect(automaticServer.api.uploadPhoto).not.toHaveBeenCalled();
    expect(left).toMatchObject({ photoProblems: 1, photosUploaded: 0 });

    const manualRun = fakePhone([], [], [stuck]);
    const manualServer = fakeServer();
    const tried = await runSync(manualServer.api, manualRun.store, manual);
    expect(manualServer.api.uploadPhoto).toHaveBeenCalledTimes(1);
    expect(tried).toMatchObject({ photoProblems: 0, photosUploaded: 1 });
  });

  it('goes on to the downloads after the photos', async () => {
    const { store } = fakePhone([], [], [photoOf(synced, 1)]);
    const { api } = fakeServer();

    await runSync(api, store, automatic);

    expect(api.uploadPhoto.mock.invocationCallOrder[0]).toBeLessThan(
      api.fetchSpecies.mock.invocationCallOrder[0],
    );
  });

  it('asks someone to sign in again if the account has gone by the time photos start', async () => {
    const { store } = fakePhone([], [], [photoOf(synced, 1)]);
    const { api } = fakeServer();
    api.accountId.mockResolvedValue(null);

    const result = await runSync(api, store, automatic);

    expect(result.outcome).toBe('signed-out');
    expect(store.loadPhotosToUpload).not.toHaveBeenCalled();
  });

  it('counts a saved photo outcome failing as a problem on the phone', async () => {
    const { store } = fakePhone([], [], [photoOf(synced, 1)]);
    const { api } = fakeServer();
    store.savePhotoOutcome.mockRejectedValue(new Error('disk full'));

    const result = await runSync(api, store, automatic);

    expect(result.outcome).toBe('error');
  });
});

describe('runSync: downloading', () => {
  it('asks about synced records in batches, including the ones it just uploaded', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);
    const { store } = fakePhone([recordNamed(1)], ids);
    const { api } = fakeServer();
    api.fetchReviews.mockImplementation(async (asked) =>
      asked.map((id) => ({ id, status: 'waiting' as const, notes: null })),
    );

    await runSync(api, store, automatic);

    expect(api.fetchReviews.mock.calls.map(([asked]) => asked.length)).toEqual([100, 100, 51]);
    const saved = store.saveReviews.mock.calls[0][0];
    expect(saved).toHaveLength(251);
    expect(saved.map((review) => review.id)).toContain(recordNamed(1).id);
  });

  it('asks about nothing when nothing has synced', async () => {
    const { store } = fakePhone([]);
    const { api } = fakeServer();
    expect((await runSync(api, store, automatic)).outcome).toBe('done');
    expect(api.fetchReviews).not.toHaveBeenCalled();
  });

  it('saves the species list and when the sync worked', async () => {
    const { store } = fakePhone([]);
    const { api } = fakeServer();
    const result = await runSync(api, store, automatic);
    expect(store.replaceSpecies).toHaveBeenCalledWith([belian]);
    expect(store.saveLastSynced).toHaveBeenCalledTimes(1);
    expect(result.refreshFailed).toBe(false);
  });

  it('keeps the old species list when the server sends an empty one', async () => {
    const { store } = fakePhone([]);
    const { api } = fakeServer();
    api.fetchSpecies.mockResolvedValue([]);
    const result = await runSync(api, store, automatic);
    expect(store.replaceSpecies).not.toHaveBeenCalled();
    expect(result.refreshFailed).toBe(false);
  });

  it('still counts as uploaded, but not fully synced, when the species list fails', async () => {
    const { store } = fakePhone([recordNamed(1)]);
    const { api } = fakeServer();
    api.fetchSpecies.mockResolvedValue(null);
    const result = await runSync(api, store, automatic);
    expect(result).toMatchObject({ outcome: 'done', uploaded: 1, refreshFailed: true });
    expect(store.saveLastSynced).not.toHaveBeenCalled();
  });

  it('still tries the species list when the decisions fail', async () => {
    const { store } = fakePhone([], ['id-1']);
    const { api } = fakeServer();
    api.fetchReviews.mockResolvedValue(null);
    const result = await runSync(api, store, automatic);
    expect(store.saveReviews).not.toHaveBeenCalled();
    expect(store.replaceSpecies).toHaveBeenCalled();
    expect(result.refreshFailed).toBe(true);
    expect(store.saveLastSynced).not.toHaveBeenCalled();
  });

  it("doesn't fail the sync when the phone can't save the species list", async () => {
    const { store } = fakePhone([]);
    const { api } = fakeServer();
    store.replaceSpecies.mockRejectedValue(new Error('database is locked'));
    expect(await runSync(api, store, automatic)).toMatchObject({
      outcome: 'done',
      refreshFailed: true,
    });
  });
});

describe('runSync: failures on the phone', () => {
  it('says so when the records cannot be read', async () => {
    const { store } = fakePhone([]);
    store.loadWaiting.mockRejectedValue(new Error('disk full'));
    const { api } = fakeServer();
    expect((await runSync(api, store, automatic)).outcome).toBe('error');
  });

  it('stops without losing count when an outcome cannot be saved', async () => {
    const { store } = fakePhone([recordNamed(1), recordNamed(2)]);
    store.saveUploadOutcome.mockRejectedValueOnce(new Error('disk full'));
    const { api } = fakeServer();
    expect(await runSync(api, store, automatic)).toMatchObject({ outcome: 'error', uploaded: 0 });
    expect(api.insertRecord).toHaveBeenCalledTimes(1);
  });
});

describe('toReviews', () => {
  it('keeps what the phone understands', () => {
    expect(
      toReviews([
        { id: 'a', status: 'waiting', review_notes: null },
        { id: 'b', status: 'rejected', review_notes: 'Wrong plant' },
        { id: 'c', status: 'published', review_notes: null },
        { id: 'd', status: 'something-new', review_notes: null },
      ]),
    ).toEqual([
      { id: 'a', status: 'waiting', notes: null },
      { id: 'b', status: 'rejected', notes: 'Wrong plant' },
      { id: 'c', status: 'published', notes: null },
    ]);
  });
});

describe('toSpeciesOptions', () => {
  it('uses the id as the slug and copes with no common names', () => {
    expect(
      toSpeciesOptions([
        { id: 'ficus', scientific_name: 'Ficus sp.', common_names: null },
        { id: 'belian', scientific_name: 'Eusideroxylon zwageri', common_names: ['Belian'] },
      ]),
    ).toEqual([
      { slug: 'ficus', scientificName: 'Ficus sp.', commonNames: [] },
      { slug: 'belian', scientificName: 'Eusideroxylon zwageri', commonNames: ['Belian'] },
    ]);
  });

  it('drops a species with no scientific name, since the form saves that name', () => {
    expect(
      toSpeciesOptions([
        { id: 'a', scientific_name: null, common_names: ['A'] },
        { id: 'b', scientific_name: '   ', common_names: ['B'] },
      ]),
    ).toEqual([]);
  });
});

describe('fetchAllPages', () => {
  const list = Array.from({ length: 1234 }, (_, index) => index);

  it('gets the whole list even if the server gives fewer rows than asked for', async () => {
    // The server's own limit is 100, under the page size of 500.
    const pages = jest.fn(async (from: number, to: number) =>
      list.slice(from, Math.min(to + 1, from + 100)),
    );
    expect(await fetchAllPages(pages)).toEqual(list);
    expect(pages).toHaveBeenCalledTimes(14);
  });

  it('stops on the empty page after the last one', async () => {
    const pages = jest.fn(async (from: number, to: number) => list.slice(from, to + 1));
    expect(await fetchAllPages(pages)).toEqual(list);
    expect(pages.mock.calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
      [1234, 1733],
    ]);
  });

  it('gives null, and not half a list, if any page fails', async () => {
    const pages = jest.fn(async (from: number, to: number) =>
      from === 0 ? list.slice(from, to + 1) : null,
    );
    expect(await fetchAllPages(pages)).toBeNull();
  });

  it('gives up on a server that never stops sending rows', async () => {
    const pages = jest.fn(async () => [1]);
    expect(await fetchAllPages(pages)).toBeNull();
    expect(pages).toHaveBeenCalledTimes(100);
  });
});

describe('syncResultMessage', () => {
  const result = (changes: Partial<SyncResult>): SyncResult => ({
    outcome: 'done',
    uploaded: 0,
    problems: 0,
    retryLater: 0,
    photosUploaded: 0,
    photoProblems: 0,
    photosRetryLater: 0,
    refreshFailed: false,
    finishedAt: '2026-10-31T00:00:00.000Z',
    ...changes,
  });

  it('says what happened on a clean sync', () => {
    expect(syncResultMessage(result({}))).toBe('Nothing new to upload.');
    expect(syncResultMessage(result({ uploaded: 1 }))).toBe('1 record uploaded.');
    expect(syncResultMessage(result({ uploaded: 3 }))).toBe('3 records uploaded.');
  });

  it('says how much is still left to do', () => {
    expect(
      syncResultMessage(result({ uploaded: 2, problems: 1, retryLater: 2, refreshFailed: true })),
    ).toBe(
      "2 records uploaded. 1 record couldn't upload. Open it to see why. 2 records will try " +
        "again next time. Couldn't download officers' decisions or the species list this time.",
    );
    expect(syncResultMessage(result({ problems: 2 }))).toBe(
      "2 records couldn't upload. Open them to see why.",
    );
    expect(syncResultMessage(result({ refreshFailed: true }))).toBe(
      "Couldn't download officers' decisions or the species list this time.",
    );
  });

  it('always says records are safe when they did not go up', () => {
    expect(syncResultMessage(result({ outcome: 'offline' }))).toMatch(/safe on this phone/);
    expect(syncResultMessage(result({ outcome: 'signed-out' }))).toMatch(/safe on this phone/);
    expect(syncResultMessage(result({ outcome: 'error' }))).toMatch(/still saved/);
  });

  it('says who can fix a role problem', () => {
    expect(syncResultMessage(result({ outcome: 'not-allowed' }))).toMatch(/Ask an admin/);
  });

  it('counts what went up before the sync stopped', () => {
    expect(syncResultMessage(result({ outcome: 'offline', uploaded: 2 }))).toMatch(
      /^2 records uploaded\. /,
    );
    expect(
      syncResultMessage(result({ outcome: 'offline', uploaded: 1, photosUploaded: 2 })),
    ).toMatch(/^1 record uploaded\. 2 photos uploaded\. /);
  });

  it('says what happened to the photos', () => {
    expect(syncResultMessage(result({ photosUploaded: 1 }))).toBe('1 photo uploaded.');
    expect(syncResultMessage(result({ uploaded: 1, photosUploaded: 3 }))).toBe(
      '1 record uploaded. 3 photos uploaded.',
    );
    expect(syncResultMessage(result({ photoProblems: 1 }))).toBe(
      "1 photo couldn't upload. Open its record to see why.",
    );
    expect(syncResultMessage(result({ photoProblems: 2, photosRetryLater: 1 }))).toBe(
      "2 photos couldn't upload. Open their records to see why. 1 photo will try again next time.",
    );
  });
});

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as splash from 'expo-router/build/utils/splash';
import * as SQLite from 'expo-sqlite';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { MOCK_RECORDS } from '@/data/mock-records';
import { SPECIES_LIST, type SpeciesOption } from '@/data/species-list';
import { DATABASE_NAME, MIGRATIONS } from '@/db/database';
import * as encryption from '@/db/encryption';
import { EMPTY_SPECIES_LIST, NOT_DELETED, openRecordsStore } from '@/db/records-store';
import { tagCodeFor } from '@/lib/id';
import { RecordsProvider, useRecords } from '@/state/records-context';
import type { NewPlantRecord, PlantRecord } from '@/types/plant-record';

function wrapper({ children }: { children: ReactNode }) {
  return <RecordsProvider>{children}</RecordsProvider>;
}

const draft: NewPlantRecord = {
  speciesName: 'Shorea macrophylla',
  speciesSlug: 'shorea-macrophylla',
  commonName: 'Engkabang',
  heightM: 12.5,
  condition: 'healthy',
};

const samplesPending = MOCK_RECORDS.filter((record) => record.syncStatus === 'pending').length;

/** Renders the provider and waits until the records on the phone have loaded. */
async function renderRecords() {
  const hook = renderHook(() => useRecords(), { wrapper });
  // The hook only runs once the provider shows its children, so result.current starts as null.
  await waitFor(() => expect(hook.result.current).not.toBeNull());
  return hook;
}

/** What's in the database on the phone, read the way the upload reads it. */
async function savedOnPhone() {
  const store = await openRecordsStore();
  try {
    return await store.loadRecords();
  } finally {
    await store.close();
  }
}

function renderApp() {
  return render(
    <RecordsProvider>
      <Text>The app</Text>
    </RecordsProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
});

describe('RecordsProvider', () => {
  it('shows a spinner until the records on the phone have loaded', async () => {
    renderApp();
    expect(screen.getByLabelText('Loading the records on this phone')).toBeVisible();
    expect(screen.queryByText('The app')).toBeNull();

    expect(await screen.findByText('The app')).toBeVisible();
    expect(screen.queryByLabelText('Loading the records on this phone')).toBeNull();
  });

  it('starts with the sample records, newest first, and none of them saved', async () => {
    const { result } = await renderRecords();
    const times = result.current.records.map((record) => record.recordedAt);
    expect(result.current.records).toHaveLength(MOCK_RECORDS.length);
    expect(times).toEqual([...times].sort().reverse());
    expect(await savedOnPhone()).toEqual([]);
  });

  it('saves a new record on the phone and puts it at the top as waiting to sync', async () => {
    const { result } = await renderRecords();
    const { pendingCount, syncedCount } = result.current;

    let saved: PlantRecord | undefined;
    await act(async () => {
      saved = await result.current.addRecord(draft);
    });

    expect(saved).toEqual({
      ...draft,
      id: expect.any(String),
      tagCode: tagCodeFor(saved!.id),
      photoCount: 0,
      recordedAt: expect.any(String),
      syncStatus: 'pending',
    });
    expect(Number.isNaN(Date.parse(saved!.recordedAt))).toBe(false);
    expect(result.current.records[0]).toEqual(saved);
    expect(result.current.records).toHaveLength(MOCK_RECORDS.length + 1);
    expect(result.current.pendingCount).toBe(pendingCount + 1);
    expect(result.current.syncedCount).toBe(syncedCount);
    // Only the new record goes in the database. The samples never do.
    expect(await savedOnPhone()).toEqual([saved]);
  });

  it('still has the saved records after the app restarts', async () => {
    const before = await renderRecords();
    let saved: PlantRecord | undefined;
    await act(async () => {
      saved = await before.result.current.addRecord({
        ...draft,
        condition: 'diseased',
        notes: 'Fungus on the lower trunk',
        // A made up point near the park HQ.
        location: {
          latitude: 3.81391,
          longitude: 113.77874,
          accuracyM: 6,
          capturedAt: new Date().toISOString(),
        },
      });
    });
    before.unmount();

    const after = await renderRecords();
    expect(after.result.current.records[0]).toEqual(saved);
    expect(after.result.current.getRecord(saved!.id)).toEqual(saved);
    expect(after.result.current.findByTag(saved!.tagCode)).toEqual(saved);
    expect(after.result.current.pendingCount).toBe(samplesPending + 1);
  });

  it('gives every new record its own ID and tag', async () => {
    const { result } = await renderRecords();
    const saved: PlantRecord[] = [];
    await act(async () => {
      for (let i = 0; i < 20; i += 1) {
        saved.push(await result.current.addRecord(draft));
      }
    });
    expect(new Set(saved.map((record) => record.id)).size).toBe(20);
    expect(new Set(saved.map((record) => record.tagCode)).size).toBe(20);
    expect(await savedOnPhone()).toHaveLength(20);
  });

  it('picks a new ID when its tag code is already on the list', async () => {
    const { result } = await renderRecords();
    const nextId = jest.mocked(randomUUID);

    nextId.mockReturnValueOnce('a1b2c3d4-0000-4000-8000-000000000001');
    let first: PlantRecord | undefined;
    await act(async () => {
      first = await result.current.addRecord(draft);
    });
    expect(first!.tagCode).toBe('NNP-A1B2C3');

    // Same first 6 characters, so the same tag code as the record just saved.
    nextId.mockReturnValueOnce('a1b2c3ff-0000-4000-8000-000000000002');
    let second: PlantRecord | undefined;
    await act(async () => {
      second = await result.current.addRecord(draft);
    });
    expect(second!.id).not.toBe('a1b2c3ff-0000-4000-8000-000000000002');
    expect(second!.tagCode).not.toBe('NNP-A1B2C3');

    // The Belian sample has tag NNP-3F2A9C, and two plants with one tag can't both be found.
    nextId.mockReturnValueOnce('3f2a9c00-0000-4000-8000-000000000003');
    let third: PlantRecord | undefined;
    await act(async () => {
      third = await result.current.addRecord(draft);
    });
    expect(third!.tagCode).not.toBe('NNP-3F2A9C');
    expect(await savedOnPhone()).toHaveLength(3);
  });

  it('finds a saved record by its ID or the tag printed on it', async () => {
    const { result } = await renderRecords();
    let saved: PlantRecord | undefined;
    await act(async () => {
      saved = await result.current.addRecord(draft);
    });

    expect(result.current.getRecord(saved!.id)).toEqual(saved);
    expect(result.current.findByTag(saved!.tagCode.toLowerCase())).toEqual(saved);
    expect(result.current.getRecord('not-a-real-id')).toBeUndefined();
    expect(result.current.findByTag('NNP-')).toBeUndefined();
  });

  it("throws and leaves the list as it was when the record can't be saved", async () => {
    const insert = jest
      .spyOn(SQLite.SQLiteDatabase.prototype, 'runAsync')
      .mockRejectedValueOnce(new Error('database or disk is full'));
    try {
      const { result } = await renderRecords();
      await act(async () => {
        await expect(result.current.addRecord(draft)).rejects.toThrow('database or disk is full');
      });
      expect(result.current.records).toHaveLength(MOCK_RECORDS.length);
      expect(result.current.pendingCount).toBe(samplesPending);
      expect(await savedOnPhone()).toEqual([]);
    } finally {
      insert.mockRestore();
    }
  });

  it("says so when the records can't be opened, and tries again", async () => {
    const open = jest
      .spyOn(SQLite, 'openDatabaseAsync')
      .mockRejectedValueOnce(new Error('unable to open database file'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const hideSplash = jest.spyOn(splash, 'hideAsync');
    try {
      renderApp();
      const message = "Couldn't open the records saved on this phone.";
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
      // Otherwise the splash screen would stay on top of the message.
      expect(hideSplash).toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("Couldn't open the records database.", expect.any(Error));
      expect(screen.queryByText('The app')).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('The app')).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(open).toHaveBeenCalledTimes(2);
    } finally {
      open.mockRestore();
      warn.mockRestore();
      hideSplash.mockRestore();
    }
  });

  it('says to update the app when a newer copy saved the records, with no Try again', async () => {
    const setup = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await setup.execAsync(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    await setup.closeAsync();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderApp();
      const message = 'Update the app to open the records saved on this phone.';
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
      expect(screen.getByText(/nothing has been changed/)).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(screen.queryByText('The app')).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it("says the records can't be unlocked when the key is gone, with no Try again", async () => {
    const open = jest
      .spyOn(encryption, 'openEncryptedDatabase')
      .mockRejectedValue(new encryption.DatabaseLockedError());
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderApp();
      const message = "The records saved on this phone can't be unlocked.";
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
      expect(screen.getByText(/Nothing here has been changed/)).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(screen.queryByText('The app')).toBeNull();
    } finally {
      open.mockRestore();
      warn.mockRestore();
    }
  });

  it('closes the database when the app closes', async () => {
    const close = jest.spyOn(SQLite.SQLiteDatabase.prototype, 'closeAsync');
    try {
      const { unmount } = await renderRecords();
      expect(close).not.toHaveBeenCalled();
      unmount();
      await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    } finally {
      close.mockRestore();
    }
  });
});

describe('syncing', () => {
  it('only hands over the records saved on the phone, never the samples', async () => {
    const { result } = await renderRecords();
    let saved: PlantRecord | undefined;
    await act(async () => {
      saved = await result.current.addRecord(draft);
    });
    expect(await result.current.loadWaiting()).toEqual([saved]);
  });

  it('shows what happened to each record, now and after the app restarts', async () => {
    const before = await renderRecords();
    let stuck: PlantRecord | undefined;
    let sent: PlantRecord | undefined;
    await act(async () => {
      stuck = await before.result.current.addRecord(draft);
      sent = await before.result.current.addRecord(draft);
    });
    await act(async () => {
      await before.result.current.saveUploadOutcome(stuck!.id, {
        kind: 'problem',
        problem: 'tag-clash',
      });
      await before.result.current.saveUploadOutcome(sent!.id, { kind: 'synced' });
    });

    const expected = [
      { ...stuck, uploadProblem: 'tag-clash' },
      { ...sent, syncStatus: 'synced' },
    ];
    expect(before.result.current.getRecord(stuck!.id)).toEqual(expected[0]);
    expect(before.result.current.getRecord(sent!.id)).toEqual(expected[1]);
    // A record with a problem still counts as waiting, because it hasn't gone up.
    expect(before.result.current.pendingCount).toBe(samplesPending + 1);
    before.unmount();

    const after = await renderRecords();
    expect(after.result.current.getRecord(stuck!.id)).toEqual(expected[0]);
    expect(after.result.current.getRecord(sent!.id)).toEqual(expected[1]);
  });

  it('leaves the list as it was when the record is already gone', async () => {
    const { result } = await renderRecords();
    const before = result.current.records;
    await act(async () => {
      await result.current.saveUploadOutcome('not-a-real-id', { kind: 'synced' });
    });
    expect(result.current.records).toEqual(before);
  });

  it("throws and leaves the list as it was when the outcome can't be saved", async () => {
    const { result } = await renderRecords();
    let sent: PlantRecord | undefined;
    await act(async () => {
      sent = await result.current.addRecord(draft);
    });
    await act(async () => {
      await result.current.saveUploadOutcome(sent!.id, { kind: 'synced' });
    });
    const before = result.current.records;
    await act(async () => {
      await expect(
        result.current.saveUploadOutcome(sent!.id, { kind: 'problem', problem: 'rejected' }),
      ).rejects.toThrow();
    });
    expect(result.current.records).toEqual(before);
  });
});

describe('removing a record an officer deleted', () => {
  it('takes it off the list and the phone, and the counts go down', async () => {
    const { result } = await renderRecords();
    let deleted: PlantRecord | undefined;
    let kept: PlantRecord | undefined;
    await act(async () => {
      deleted = await result.current.addRecord(draft);
      kept = await result.current.addRecord(draft);
    });
    await act(async () => {
      await result.current.saveUploadOutcome(deleted!.id, { kind: 'problem', problem: 'deleted' });
    });
    expect(result.current.pendingCount).toBe(samplesPending + 2);

    await act(async () => {
      await result.current.removeDeleted(deleted!.id);
    });
    expect(result.current.getRecord(deleted!.id)).toBeUndefined();
    expect(result.current.getRecord(kept!.id)).toEqual(kept);
    expect(result.current.pendingCount).toBe(samplesPending + 1);
    expect((await savedOnPhone()).map((record) => record.id)).toEqual([kept!.id]);
  });

  it('throws and leaves the list as it was for any other record', async () => {
    const { result } = await renderRecords();
    let waiting: PlantRecord | undefined;
    await act(async () => {
      waiting = await result.current.addRecord(draft);
    });
    const before = result.current.records;
    await act(async () => {
      await expect(result.current.removeDeleted(waiting!.id)).rejects.toThrow(NOT_DELETED);
    });
    expect(result.current.records).toEqual(before);
    expect(await savedOnPhone()).toEqual([waiting]);
  });
});

describe('photos', () => {
  const ACCOUNT = 'aaaaaaaa-0000-4000-8000-000000000000';

  /** Saves a record with photos and sends the record up, as the account given. */
  async function savedAndUploaded(
    result: { current: ReturnType<typeof useRecords> },
    paths: string[],
  ) {
    let saved!: PlantRecord;
    await act(async () => {
      saved = await result.current.addRecord(draft, paths);
      await result.current.saveUploadOutcome(saved.id, { kind: 'synced' }, ACCOUNT);
    });
    return saved;
  }

  function saveFile(name: string) {
    new Directory(Paths.document, 'record-photos').create({ idempotent: true });
    new File(Paths.document, 'record-photos', name).write(new Uint8Array([1]));
    return `record-photos/${name}`;
  }

  afterEach(() => {
    new Directory(Paths.document, 'record-photos').delete();
  });

  it('saves the photos with the record, and counts them', async () => {
    const { result } = await renderRecords();
    const path = saveFile('a.jpg');
    let saved!: PlantRecord;
    await act(async () => {
      saved = await result.current.addRecord(draft, [path]);
    });
    expect(saved.photoCount).toBe(1);
    expect(result.current.photosFor(saved.id)).toEqual([{ recordId: saved.id, position: 1, path }]);
  });

  it('only counts photos as waiting once their record is on the server', async () => {
    const { result } = await renderRecords();
    const path = saveFile('a.jpg');
    let saved!: PlantRecord;
    await act(async () => {
      saved = await result.current.addRecord(draft, [path]);
    });
    expect(result.current.waitingPhotoCount).toBe(0);
    await act(async () => {
      await result.current.saveUploadOutcome(saved.id, { kind: 'synced' }, ACCOUNT);
    });
    expect(result.current.waitingPhotoCount).toBe(1);
  });

  it('keeps photos waiting for the account that sent the record, not anyone else', async () => {
    const { result } = await renderRecords();
    await savedAndUploaded(result, [saveFile('a.jpg')]);
    expect(result.current.photosWaitingFor(ACCOUNT)).toBe(1);
    expect(result.current.photosWaitingFor('someone-else')).toBe(0);
    expect(result.current.photosWaitingFor(undefined)).toBe(0);
  });

  it('stops counting a photo once it is up, and shows a problem now and after a restart', async () => {
    const before = await renderRecords();
    const saved = await savedAndUploaded(before.result, [saveFile('a.jpg'), saveFile('b.jpg')]);
    await act(async () => {
      await before.result.current.savePhotoOutcome(saved.id, 1, {
        kind: 'uploaded',
        uploadedAt: '2026-11-01T01:00:00.000Z',
      });
      await before.result.current.savePhotoOutcome(saved.id, 2, {
        kind: 'problem',
        problem: 'missing',
      });
    });
    expect(before.result.current.waitingPhotoCount).toBe(0);
    expect(before.result.current.photoProblemCount).toBe(1);
    before.unmount();

    const { result } = await renderRecords();
    expect(result.current.photoProblemCount).toBe(1);
    expect(result.current.photosFor(saved.id).map((photo) => photo.problem)).toEqual([
      undefined,
      'missing',
    ]);
  });

  it('deletes the files of a record an officer deleted', async () => {
    const { result } = await renderRecords();
    const path = saveFile('a.jpg');
    let saved!: PlantRecord;
    await act(async () => {
      saved = await result.current.addRecord(draft, [path]);
      await result.current.saveUploadOutcome(saved.id, { kind: 'problem', problem: 'deleted' });
    });
    await act(async () => {
      await result.current.removeDeleted(saved.id);
    });
    expect(result.current.photosFor(saved.id)).toEqual([]);
    expect(new File(Paths.document, path).exists).toBe(false);
  });

  it('moves the photos with a record that gets a new tag', async () => {
    const { result } = await renderRecords();
    const path = saveFile('a.jpg');
    let saved!: PlantRecord;
    await act(async () => {
      saved = await result.current.addRecord(draft, [path]);
      await result.current.saveUploadOutcome(saved.id, { kind: 'problem', problem: 'tag-clash' });
    });
    let newId!: string;
    await act(async () => {
      newId = await result.current.renewTag(saved.id);
    });
    expect(result.current.photosFor(saved.id)).toEqual([]);
    expect(result.current.photosFor(newId)).toEqual([{ recordId: newId, position: 1, path }]);
  });

  it('clears out files no record owns when the app opens, and keeps the rest', async () => {
    const before = await renderRecords();
    const kept = saveFile('kept.jpg');
    await act(async () => {
      await before.result.current.addRecord(draft, [kept]);
    });
    before.unmount();

    const stray = saveFile('from-a-form-never-saved.jpg');
    await renderRecords();

    expect(new File(Paths.document, kept).exists).toBe(true);
    expect(new File(Paths.document, stray).exists).toBe(false);
  });
});

describe('species list', () => {
  // A species added on the website after the app came out. Names only.
  const fig: SpeciesOption = {
    slug: 'ficus-benjamina',
    scientificName: 'Ficus benjamina',
    commonNames: ['Weeping fig'],
  };

  it('uses the list that comes with the app until the first download', async () => {
    const { result } = await renderRecords();
    expect(result.current.species).toEqual(SPECIES_LIST);
  });

  it('uses a downloaded list straight away and after the app restarts', async () => {
    const before = await renderRecords();
    await act(async () => {
      await before.result.current.replaceSpecies([fig]);
    });
    expect(before.result.current.species).toEqual([fig]);
    before.unmount();

    const after = await renderRecords();
    expect(after.result.current.species).toEqual([fig]);
  });

  it("throws and keeps the old list when the new one can't be saved", async () => {
    const { result } = await renderRecords();
    await act(async () => {
      await expect(result.current.replaceSpecies([])).rejects.toThrow(EMPTY_SPECIES_LIST);
    });
    expect(result.current.species).toEqual(SPECIES_LIST);
  });
});

describe('useRecords', () => {
  it('says what went wrong when used outside the provider', () => {
    // React logs the error as well, which would only clutter the test output.
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useRecords())).toThrow(
      'useRecords has to be used inside RecordsProvider.',
    );
    logError.mockRestore();
  });
});

describe('waitingCount', () => {
  it('counts saved records still to go up, and not samples or ones with a problem', async () => {
    const first = await renderRecords();
    expect(first.result.current.waitingCount).toBe(0);
    let saved: PlantRecord;
    await act(async () => {
      saved = await first.result.current.addRecord(draft);
    });
    expect(first.result.current.waitingCount).toBe(1);
    first.unmount();

    const store = await openRecordsStore();
    await store.saveUploadOutcome(saved!.id, { kind: 'problem', problem: 'rejected' });
    await store.close();
    const second = await renderRecords();
    expect(second.result.current.waitingCount).toBe(0);
  });
});

describe('notUploadedCount', () => {
  it('counts saved records that are not on the server, problems too, and never samples', async () => {
    const first = await renderRecords();
    expect(first.result.current.notUploadedCount).toBe(0);
    let saved: PlantRecord;
    await act(async () => {
      saved = await first.result.current.addRecord(draft);
    });
    expect(first.result.current.notUploadedCount).toBe(1);
    first.unmount();

    const store = await openRecordsStore();
    await store.saveUploadOutcome(saved!.id, { kind: 'problem', problem: 'rejected' });
    await store.close();
    const second = await renderRecords();
    expect(second.result.current.notUploadedCount).toBe(1);
    second.unmount();

    const again = await openRecordsStore();
    await again.saveUploadOutcome(saved!.id, { kind: 'synced' });
    await again.close();
    const third = await renderRecords();
    expect(third.result.current.notUploadedCount).toBe(0);
  });
});

describe('renewTag', () => {
  it('gives a record with a tag clash a new ID and tag code that go together', async () => {
    const first = await renderRecords();
    let saved: PlantRecord;
    await act(async () => {
      saved = await first.result.current.addRecord(draft);
    });
    first.unmount();
    const store = await openRecordsStore();
    await store.saveUploadOutcome(saved!.id, { kind: 'problem', problem: 'tag-clash' });
    await store.close();

    const { result } = await renderRecords();
    let newId = '';
    await act(async () => {
      newId = await result.current.renewTag(saved!.id);
    });
    expect(newId).not.toBe(saved!.id);
    expect(result.current.getRecord(saved!.id)).toBeUndefined();
    const renewed = result.current.getRecord(newId);
    expect(renewed?.tagCode).toBe(tagCodeFor(newId));
    expect(renewed?.uploadProblem).toBeUndefined();
    expect(renewed?.speciesName).toBe(draft.speciesName);
    expect((await savedOnPhone()).find((record) => record.id === newId)).toEqual(renewed);
  });
});

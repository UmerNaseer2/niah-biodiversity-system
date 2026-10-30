import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import * as splash from 'expo-router/build/utils/splash';
import * as SQLite from 'expo-sqlite';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { MOCK_RECORDS } from '@/data/mock-records';
import { SPECIES_LIST, type SpeciesOption } from '@/data/species-list';
import { DATABASE_NAME } from '@/db/database';
import { EMPTY_SPECIES_LIST, NO_SUCH_RECORD, openRecordsStore } from '@/db/records-store';
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

/** What's in the database on the phone, read the way the upload in item 10 will read it. */
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

  it("throws and leaves the list as it was when the outcome can't be saved", async () => {
    const { result } = await renderRecords();
    const before = result.current.records;
    await act(async () => {
      await expect(
        result.current.saveUploadOutcome('not-a-real-id', { kind: 'synced' }),
      ).rejects.toThrow(NO_SUCH_RECORD);
    });
    expect(result.current.records).toEqual(before);
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

import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { deleteDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';
import { AccessibilityInfo } from 'react-native';

import RecordsScreen from '@/app/(tabs)/records';
import RecordScreen from '@/app/record/[id]';
import { MOCK_RECORDS } from '@/data/mock-records';
import { DATABASE_NAME } from '@/db/database';
import { openRecordsStore } from '@/db/records-store';
import { RecordsProvider } from '@/state/records-context';
import { uploadProblemMessage } from '@/sync/upload-row';
import { UPLOAD_PROBLEMS, type PlantRecord, type UploadProblem } from '@/types/plant-record';

function TestLayout() {
  return (
    <RecordsProvider>
      <Stack />
    </RecordsProvider>
  );
}

// A record saved on the phone that the server turned down at the last sync. It's the newest, so
// it's at the top of the list.
const stuck: PlantRecord = {
  id: 'b7e3f9d1-2c4a-4e6b-8d0f-1a3c5e7b9d20',
  tagCode: 'NNP-B7E3F9',
  speciesName: 'Ficus benjamina',
  commonName: 'Weeping fig',
  condition: 'healthy',
  photoCount: 0,
  recordedAt: new Date().toISOString(),
  syncStatus: 'pending',
  uploadProblem: 'tag-clash',
};

const samplesPending = MOCK_RECORDS.filter((record) => record.syncStatus === 'pending').length;
const samplesSynced = MOCK_RECORDS.length - samplesPending;

/** Opens My records once the records saved on the phone have loaded. */
async function renderList() {
  renderRouter(
    { _layout: TestLayout, records: RecordsScreen, 'record/[id]': RecordScreen },
    { initialUrl: '/records' },
  );
  await screen.findByRole('heading', { name: 'My records' });
}

/** Opens the record's page, after its last upload came back with this problem. */
async function openWith(problem: UploadProblem) {
  const store = await openRecordsStore();
  try {
    await store.saveUploadOutcome(stuck.id, { kind: 'problem', problem });
  } finally {
    await store.close();
  }
  await renderList();
  fireEvent.press(screen.getByRole('link', { name: /^Ficus benjamina, Weeping fig/ }));
  expect(await screen.findByText(uploadProblemMessage(problem))).toBeVisible();
}

const removeFailed = "Couldn't remove the record from this phone. Try again.";

beforeEach(async () => {
  jest.clearAllMocks();
  await deleteDatabaseAsync(DATABASE_NAME);
  const store = await openRecordsStore();
  try {
    await store.saveRecord(stuck);
  } finally {
    await store.close();
  }
});

describe('My records', () => {
  it('lists every record with how its upload is going', async () => {
    await renderList();
    expect(screen.getByText(`${MOCK_RECORDS.length + 1} records on this phone`)).toBeVisible();
    // The record with a problem won't go up by waiting for signal, so it's counted on its own.
    expect(
      screen.getByRole('heading', { name: `${samplesPending} records waiting to sync` }),
    ).toBeVisible();
    expect(screen.getByText(/^1 record also couldn't upload last time/)).toBeVisible();

    const row = screen.getByRole('link', { name: /^Ficus benjamina, Weeping fig/ });
    expect(row).toHaveAccessibleName(/, couldn't upload, /);
    expect(within(row).getByText("Couldn't upload")).toBeVisible();
    expect(within(row).queryByText('Pending sync')).toBeNull();
    expect(screen.getAllByText('Pending sync')).toHaveLength(samplesPending);
    expect(screen.getAllByText('Synced')).toHaveLength(samplesSynced);
  });

  it('filters the list by upload state', async () => {
    await renderList();
    fireEvent.press(screen.getByRole('radio', { name: `Synced, ${samplesSynced}` }));
    expect(screen.getByRole('radio', { name: `Synced, ${samplesSynced}` })).toBeChecked();
    expect(screen.getAllByText('Synced')).toHaveLength(samplesSynced);
    expect(screen.queryByText('Pending sync')).toBeNull();
    expect(screen.queryByText("Couldn't upload")).toBeNull();

    // The record with a problem is still waiting, so it shows under Pending.
    fireEvent.press(screen.getByRole('radio', { name: `Pending, ${samplesPending + 1}` }));
    expect(screen.getByText("Couldn't upload")).toBeVisible();
    expect(screen.getAllByText('Pending sync')).toHaveLength(samplesPending);
    expect(screen.queryByText('Synced')).toBeNull();
  });

  it('offers to remove a record an officer deleted, and asks first', async () => {
    await openWith('deleted');

    // Keep it puts the button back and changes nothing.
    fireEvent.press(screen.getByRole('button', { name: 'Remove from this phone' }));
    const question = /gone for good\. Remove it\?$/;
    expect(screen.getByRole('alert', { name: question })).toBeVisible();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      expect.stringMatching(question),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText(/gone for good/)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Remove from this phone' }));
    fireEvent.press(screen.getByRole('button', { name: 'Remove it' }));
    expect(await screen.findByRole('heading', { name: 'My records' })).toBeVisible();
    expect(screen.getByText(`${MOCK_RECORDS.length} records on this phone`)).toBeVisible();
    expect(screen.queryByRole('link', { name: /^Ficus benjamina, Weeping fig/ })).toBeNull();
  });

  it("says so when the record can't be removed, and Keep it clears that", async () => {
    await openWith('deleted');
    const failure = jest
      .spyOn(SQLiteDatabase.prototype, 'runAsync')
      .mockRejectedValueOnce(new Error('database is locked'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      fireEvent.press(screen.getByRole('button', { name: 'Remove from this phone' }));
      fireEvent.press(screen.getByRole('button', { name: 'Remove it' }));

      expect(await screen.findByRole('alert', { name: removeFailed })).toBeVisible();
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(removeFailed);
      expect(warn).toHaveBeenCalledWith("Couldn't remove the record.", expect.any(Error));
      expect(screen.getByRole('button', { name: 'Remove it' })).toBeEnabled();

      // Asking again starts clean, and it works now the database is free.
      fireEvent.press(screen.getByRole('button', { name: 'Keep it' }));
      fireEvent.press(screen.getByRole('button', { name: 'Remove from this phone' }));
      expect(screen.queryByText(removeFailed)).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Remove it' }));
      expect(await screen.findByRole('heading', { name: 'My records' })).toBeVisible();
      expect(screen.getByText(`${MOCK_RECORDS.length} records on this phone`)).toBeVisible();
    } finally {
      failure.mockRestore();
      warn.mockRestore();
    }
  });

  it('only removes the record once when Remove it is tapped twice quickly', async () => {
    await openWith('deleted');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      fireEvent.press(screen.getByRole('button', { name: 'Remove from this phone' }));
      const remove = screen.getByRole('button', { name: 'Remove it' });
      // In one act, so the button hasn't shown as disabled yet when the second tap lands.
      act(() => {
        fireEvent.press(remove);
        fireEvent.press(remove);
      });

      expect(await screen.findByRole('heading', { name: 'My records' })).toBeVisible();
      expect(warn).not.toHaveBeenCalled();
      expect(screen.getByText(`${MOCK_RECORDS.length} records on this phone`)).toBeVisible();
    } finally {
      warn.mockRestore();
    }
  });

  // These can all still go up in the end, so taking one off the phone could lose it.
  it.each(UPLOAD_PROBLEMS.filter((problem) => problem !== 'deleted'))(
    "doesn't offer to remove a record with the %s problem",
    async (problem) => {
      await openWith(problem);
      expect(screen.queryByRole('button', { name: 'Remove from this phone' })).toBeNull();
    },
  );

  it("says on the record's page why it couldn't upload", async () => {
    await renderList();
    fireEvent.press(screen.getByRole('link', { name: /^Ficus benjamina, Weeping fig/ }));

    expect(await screen.findByText(`Tag ${stuck.tagCode}`)).toBeVisible();
    expect(screen.getByRole('heading', { name: "Couldn't upload" })).toBeVisible();
    expect(screen.getByText(uploadProblemMessage('tag-clash'))).toBeVisible();
  });
});

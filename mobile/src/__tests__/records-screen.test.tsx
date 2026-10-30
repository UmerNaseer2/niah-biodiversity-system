import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { deleteDatabaseAsync } from 'expo-sqlite';

import RecordsScreen from '@/app/(tabs)/records';
import RecordScreen from '@/app/record/[id]';
import { MOCK_RECORDS } from '@/data/mock-records';
import { DATABASE_NAME } from '@/db/database';
import { openRecordsStore } from '@/db/records-store';
import { RecordsProvider } from '@/state/records-context';
import { uploadProblemMessage } from '@/sync/upload-row';
import type { PlantRecord } from '@/types/plant-record';

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

beforeEach(async () => {
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
    const store = await openRecordsStore();
    try {
      await store.saveUploadOutcome(stuck.id, { kind: 'problem', problem: 'deleted' });
    } finally {
      await store.close();
    }
    await renderList();
    fireEvent.press(screen.getByRole('link', { name: /^Ficus benjamina, Weeping fig/ }));
    expect(await screen.findByText(uploadProblemMessage('deleted'))).toBeVisible();

    // Keep it puts the button back and changes nothing.
    fireEvent.press(screen.getByRole('button', { name: 'Remove from this phone' }));
    expect(screen.getByText(/gone for good\. Remove it\?$/)).toBeVisible();
    fireEvent.press(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText(/gone for good/)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Remove from this phone' }));
    fireEvent.press(screen.getByRole('button', { name: 'Remove it' }));
    expect(await screen.findByRole('heading', { name: 'My records' })).toBeVisible();
    expect(screen.getByText(`${MOCK_RECORDS.length} records on this phone`)).toBeVisible();
    expect(screen.queryByRole('link', { name: /^Ficus benjamina, Weeping fig/ })).toBeNull();
  });

  it("doesn't offer to remove a record with any other problem", async () => {
    await renderList();
    fireEvent.press(screen.getByRole('link', { name: /^Ficus benjamina, Weeping fig/ }));
    expect(await screen.findByText(uploadProblemMessage('tag-clash'))).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove from this phone' })).toBeNull();
  });

  it("says on the record's page why it couldn't upload", async () => {
    await renderList();
    fireEvent.press(screen.getByRole('link', { name: /^Ficus benjamina, Weeping fig/ }));

    expect(await screen.findByText(`Tag ${stuck.tagCode}`)).toBeVisible();
    expect(screen.getByRole('heading', { name: "Couldn't upload" })).toBeVisible();
    expect(screen.getByText(uploadProblemMessage('tag-clash'))).toBeVisible();
  });
});

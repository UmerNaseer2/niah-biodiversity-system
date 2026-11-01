import { render, screen } from '@testing-library/react-native';

import { RecordPhotos } from '@/components/record-photos';
import { useAccount } from '@/state/account-context';
import { useRecords } from '@/state/records-context';
import type { PlantRecord, RecordPhoto } from '@/types/plant-record';

jest.mock('@/state/account-context');
jest.mock('@/state/records-context');

const SENDER = 'aaaaaaaa-0000-4000-8000-000000000000';
const SOMEONE_ELSE = 'bbbbbbbb-0000-4000-8000-000000000000';

const record: PlantRecord = {
  id: 'c8f4a0e2-3d5b-4f7c-9e1a-2b4d6f8a0c31',
  tagCode: 'NNP-C8F4A0',
  speciesName: 'Ficus benjamina',
  condition: 'healthy',
  photoCount: 2,
  recordedAt: '2026-10-31T01:00:00.000Z',
  syncStatus: 'synced',
  uploadedBy: SENDER,
};

function photo(position: number, changes: Partial<RecordPhoto> = {}): RecordPhoto {
  return { recordId: record.id, position, path: `record-photos/${position}.jpg`, ...changes };
}

function renderWith(
  photos: RecordPhoto[],
  signedInAs = SENDER,
  changes: Partial<PlantRecord> = {},
) {
  jest.mocked(useRecords).mockReturnValue({
    photosFor: () => photos,
  } as unknown as ReturnType<typeof useRecords>);
  jest.mocked(useAccount).mockReturnValue({
    account: { userId: signedInAs },
  } as unknown as ReturnType<typeof useAccount>);
  render(<RecordPhotos record={{ ...record, ...changes }} />);
}

describe('RecordPhotos', () => {
  it('shows nothing for a record with no photos on this phone', () => {
    renderWith([]);
    expect(screen.queryByText('Photos')).toBeNull();
  });

  it('labels each photo for a screen reader', () => {
    renderWith([photo(1), photo(2)]);
    expect(screen.getByText('Photos')).toBeVisible();
    expect(screen.getByLabelText('Photo 1')).toBeVisible();
    expect(screen.getByLabelText('Photo 2')).toBeVisible();
  });

  it('says they follow the record while the record is still waiting', () => {
    renderWith([photo(1)], SENDER, { syncStatus: 'pending', uploadedBy: undefined });
    expect(screen.getByText('It goes up after the record does.')).toBeVisible();
  });

  it('says so in the plural too', () => {
    renderWith([photo(1), photo(2)], SENDER, { syncStatus: 'pending', uploadedBy: undefined });
    expect(screen.getByText('They go up after the record does.')).toBeVisible();
  });

  it('says when they have all gone up', () => {
    renderWith([photo(1, { uploadedAt: '2026-10-31T02:00:00.000Z' })]);
    expect(screen.getByText('On the server as well.')).toBeVisible();
  });

  it('counts only what is still to go, for the account that can send it', () => {
    renderWith([photo(1, { uploadedAt: '2026-10-31T02:00:00.000Z' }), photo(2), photo(3)]);
    expect(
      screen.getByText(
        '2 photos still on this phone only. They go up on their own when you have signal.',
      ),
    ).toBeVisible();
  });

  it('gets one photo right', () => {
    renderWith([photo(1)]);
    expect(
      screen.getByText(
        '1 photo still on this phone only. It goes up on its own when you have signal.',
      ),
    ).toBeVisible();
  });

  it('explains why a photo waits for the account that sent the record', () => {
    renderWith([photo(1)], SOMEONE_ELSE);
    expect(
      screen.getByText(
        '1 photo still on this phone only. The website looks for it under the account that sent this record, so it waits until that account signs in.',
      ),
    ).toBeVisible();
  });

  it('explains it for several photos too', () => {
    renderWith([photo(1), photo(2)], SOMEONE_ELSE);
    expect(
      screen.getByText(
        '2 photos still on this phone only. The website looks for them under the account that sent this record, so they wait until that account signs in.',
      ),
    ).toBeVisible();
  });

  it('says what went wrong with each photo that has a problem', () => {
    renderWith([photo(1, { problem: 'missing' }), photo(2, { problem: 'rejected' })]);
    expect(
      screen.getByText("Photo 1 isn't on this phone any more, so it can't upload."),
    ).toBeVisible();
    expect(
      screen.getByText('The server turned down photo 2. Press Sync now to try again.'),
    ).toBeVisible();
    // Nothing is on its way, and they aren't all up either, so there's no status line to give.
    expect(screen.queryByText('On the server as well.')).toBeNull();
    expect(screen.queryByText(/still on this phone only/)).toBeNull();
  });
});

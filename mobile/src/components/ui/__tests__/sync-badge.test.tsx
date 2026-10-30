import { render, screen } from '@testing-library/react-native';

import { SyncBadge, SyncBanner } from '@/components/ui/sync-badge';

describe('SyncBadge', () => {
  it('says there are no records yet instead of everything being synced', () => {
    render(<SyncBadge pending={0} total={0} />);
    expect(screen.getByText('No records yet')).toBeVisible();
    expect(screen.queryByText('Everything is synced')).toBeNull();
  });

  it('says everything is synced once there are records and none are waiting', () => {
    render(<SyncBadge pending={0} total={4} />);
    expect(screen.getByText('Everything is synced')).toBeVisible();
  });

  it('counts the records waiting to sync', () => {
    render(<SyncBadge pending={1} total={4} />);
    expect(screen.getByText('1 record waiting to sync')).toBeVisible();
  });
});

describe('SyncBanner', () => {
  it('shows nothing when every record is synced', () => {
    render(<SyncBanner waiting={0} problems={0} />);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('counts records waiting for signal, with Sync now', () => {
    render(<SyncBanner waiting={2} problems={0} />);
    expect(screen.getByRole('heading', { name: '2 records waiting to sync' })).toBeVisible();
    expect(screen.getByText(/^They are saved on this phone/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeVisible();
    expect(screen.queryByText(/couldn't upload/)).toBeNull();
  });

  it('counts records with an upload problem apart from the ones waiting', () => {
    render(<SyncBanner waiting={1} problems={2} />);
    expect(screen.getByRole('heading', { name: '1 record waiting to sync' })).toBeVisible();
    expect(screen.getByText(/^It is saved on this phone/)).toBeVisible();
    expect(
      screen.getByText(
        "2 records also couldn't upload last time and won't go up until they are sorted out. " +
          'Open them to see why.',
      ),
    ).toBeVisible();
  });

  it('talks only about the problem when nothing else is waiting, and hides Sync now', () => {
    render(<SyncBanner waiting={0} problems={1} />);
    expect(screen.getByRole('heading', { name: "1 record couldn't upload" })).toBeVisible();
    expect(
      screen.getByText(
        "It is still saved on this phone, but won't go up until it is sorted out. " +
          'Open it to see why.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/waiting to sync/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });
});

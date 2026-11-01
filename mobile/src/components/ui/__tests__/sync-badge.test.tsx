import { fireEvent, render, screen } from '@testing-library/react-native';

import { SyncBadge, SyncBanner, syncTagLabel } from '@/components/ui/sync-badge';

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
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('counts records waiting for signal, and says they go up on their own', () => {
    render(<SyncBanner waiting={2} problems={0} signedIn />);
    expect(screen.getByRole('heading', { name: '2 records waiting to sync' })).toBeVisible();
    expect(
      screen.getByText(
        'They are saved on this phone and safe to leave. They go up on their own when you have ' +
          'signal.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeVisible();
    expect(screen.queryByText(/couldn't upload/)).toBeNull();
  });

  it('says signing in comes first when nobody is signed in', () => {
    const onSignIn = jest.fn();
    render(<SyncBanner waiting={1} problems={0} onSignIn={onSignIn} />);
    expect(
      screen.getByText(
        'It is saved on this phone and safe to leave. Sign in and it goes up when you have signal.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Sign in to sync' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('counts records with an upload problem apart from the ones waiting', () => {
    render(<SyncBanner waiting={1} problems={2} signedIn />);
    expect(screen.getByRole('heading', { name: '1 record waiting to sync' })).toBeVisible();
    expect(screen.getByText(/^It is saved on this phone/)).toBeVisible();
    expect(
      screen.getByText(
        "2 records also couldn't upload last time. Open them to see why, and press Sync now " +
          "once they're sorted out.",
      ),
    ).toBeVisible();
  });

  it('talks only about the problem when nothing else is waiting, and keeps Sync now', () => {
    const onSync = jest.fn();
    render(<SyncBanner waiting={0} problems={1} signedIn onSync={onSync} />);
    expect(screen.getByRole('heading', { name: "1 record couldn't upload" })).toBeVisible();
    expect(
      screen.getByText(
        "It is still saved on this phone. Open it to see why, and press Sync now once it's " +
          'sorted out.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/waiting to sync/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("doesn't let a second sync start while one is running", () => {
    const onSync = jest.fn();
    render(<SyncBanner waiting={1} problems={0} signedIn syncing onSync={onSync} />);
    const button = screen.getByRole('button', { name: 'Syncing...' });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onSync).not.toHaveBeenCalled();
  });

  it('shows what the last sync came to, even with nothing left to do', () => {
    render(<SyncBanner waiting={0} problems={0} signedIn message="2 records uploaded." />);
    expect(screen.getByText('2 records uploaded.')).toBeVisible();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SyncBanner with photos', () => {
  it('talks about the photos when the records have all gone up', () => {
    const onSync = jest.fn();
    render(<SyncBanner waiting={0} problems={0} photosWaiting={2} signedIn onSync={onSync} />);
    expect(screen.getByRole('heading', { name: '2 photos waiting to upload' })).toBeVisible();
    expect(screen.getByText('2 photos go up on their own when you have signal.')).toBeVisible();
    expect(screen.queryByText(/waiting to sync/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('says when photos are waiting for the account that sent their record', () => {
    render(<SyncBanner waiting={0} problems={0} photosHeld={1} signedIn />);
    expect(screen.getByRole('heading', { name: '1 photo waiting to upload' })).toBeVisible();
    expect(
      screen.getByText('1 photo waits for the account that sent its record to sign in.'),
    ).toBeVisible();
  });

  it('says when photos could not upload', () => {
    render(<SyncBanner waiting={0} problems={0} photoProblems={3} signedIn />);
    expect(screen.getByRole('heading', { name: "3 photos couldn't upload" })).toBeVisible();
    expect(
      screen.getByText("3 photos couldn't upload. Open their records to see why."),
    ).toBeVisible();
  });

  it("doesn't repeat what the last sync already said", () => {
    const said =
      "1 record couldn't upload. Open it to see why. 1 photo couldn't upload. Open its record to see why.";
    render(<SyncBanner waiting={1} problems={1} photoProblems={1} message={said} signedIn />);
    expect(screen.getByText(said)).toBeVisible();
    expect(screen.queryByText(/also couldn't upload last time/)).toBeNull();
    expect(screen.queryByText("1 photo couldn't upload. Open its record to see why.")).toBeNull();
  });

  it('still says it when the last sync was about something else', () => {
    render(
      <SyncBanner
        waiting={1}
        problems={1}
        photoProblems={1}
        message="2 photos uploaded."
        signedIn
      />,
    );
    expect(screen.getByText(/1 record also couldn't upload last time/)).toBeVisible();
    expect(screen.getByText("1 photo couldn't upload. Open its record to see why.")).toBeVisible();
  });

  it('keeps the records in the title when both are waiting', () => {
    render(<SyncBanner waiting={1} problems={0} photosWaiting={1} signedIn />);
    expect(screen.getByRole('heading', { name: '1 record waiting to sync' })).toBeVisible();
    expect(screen.getByText('1 photo goes up on its own when you have signal.')).toBeVisible();
  });
});

describe('SyncBadge with photos', () => {
  it('says what is left, records first', () => {
    const { rerender } = render(<SyncBadge pending={1} total={4} photos={2} />);
    expect(screen.getByText('1 record waiting to sync')).toBeVisible();
    rerender(<SyncBadge pending={0} total={4} photos={2} />);
    expect(screen.getByText('2 photos not uploaded')).toBeVisible();
    rerender(<SyncBadge pending={0} total={4} photos={0} />);
    expect(screen.getByText('Everything is synced')).toBeVisible();
  });
});

describe('syncTagLabel', () => {
  it('goes by the upload first, then what an officer decided', () => {
    expect(syncTagLabel('pending')).toBe('Pending sync');
    expect(syncTagLabel('pending', 'tag-clash')).toBe("Couldn't upload");
    expect(syncTagLabel('synced')).toBe('Synced');
    expect(syncTagLabel('synced', undefined, 'waiting')).toBe('Synced');
    expect(syncTagLabel('synced', undefined, 'published')).toBe('Approved');
    expect(syncTagLabel('synced', undefined, 'rejected')).toBe('Rejected');
  });
});

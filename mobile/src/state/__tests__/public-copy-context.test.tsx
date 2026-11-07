import { act, renderHook } from '@testing-library/react-native';
import * as Network from 'expo-network';
import type { ReactNode } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import {
  deleteSpeciesPhoto,
  downloadSpeciesPhoto,
  removeStraySpeciesPhotos,
} from '@/lib/species-photo-files';
import { getSupabase } from '@/lib/supabase';
import { PublicCopyProvider, usePublicCopy } from '@/state/public-copy-context';
import { useRecords } from '@/state/records-context';
import { downloadPublicCopy, type DownloadOutcome } from '@/sync/public-copy';
import { downloadMissingPhotos } from '@/sync/public-photos';
import { supabasePublicCopyApi } from '@/sync/supabase-public-api';
import type { AppMode } from '@/types/app-mode';

// This file is about when the plant info and the species photos download, and what the app says
// about it. What a download does is in src/sync/__tests__/public-copy.test.ts, and what a round of
// photo downloads does is in src/sync/__tests__/public-photos.test.ts.

jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/state/records-context', () => ({ useRecords: jest.fn() }));
jest.mock('@/sync/supabase-public-api', () => ({ supabasePublicCopyApi: jest.fn() }));
jest.mock('@/sync/public-copy', () => ({
  ...jest.requireActual('@/sync/public-copy'),
  downloadPublicCopy: jest.fn(),
}));
jest.mock('@/sync/public-photos', () => ({ downloadMissingPhotos: jest.fn() }));

const MINUTE = 60 * 1000;
const DOWNLOADED = '2026-11-04T06:15:00.000Z';
const MODES: AppMode[] = ['visitor', 'staff'];
const NOT_DONE: DownloadOutcome[] = ['offline', 'failed'];

// Stand-ins for the Supabase client and the server made from it, so the tests can check the
// downloads get the right ones.
const SUPABASE = {};
const SERVER = { online: jest.fn() };

let appStateListener: (state: string) => void;
let networkListener: (state: { isConnected?: boolean }) => void;
const stopAppState = jest.fn();
const stopNetwork = jest.fn();
const replacePublicCopy = jest.fn(async () => {});
const loadPublicPhotos = jest.fn();
const savePublicPhotoFile = jest.fn();

/** Who uses the phone, and when the plant info saved on it came down (null if it hasn't yet). */
function setRecords(mode: AppMode | null, publicCopyAt: string | null = null) {
  jest.mocked(useRecords).mockReturnValue({
    mode,
    publicCopyAt,
    replacePublicCopy,
    loadPublicPhotos,
    savePublicPhotoFile,
  } as never);
}

function wrapper({ children }: { children: ReactNode }) {
  return <PublicCopyProvider>{children}</PublicCopyProvider>;
}

/** Renders the provider, and lets everything that starts when it opens finish. */
async function renderCopy() {
  const hook = renderHook(() => usePublicCopy(), { wrapper });
  await settle();
  return hook;
}

async function settle(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

const downloads = () => jest.mocked(downloadPublicCopy).mock.calls.length;

/** Keeps the next download going until the test says how it ended. */
function holdNextDownload() {
  let finish = (_outcome: DownloadOutcome) => {};
  jest.mocked(downloadPublicCopy).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  return (outcome: DownloadOutcome) => finish(outcome);
}

const photoRounds = () => jest.mocked(downloadMissingPhotos).mock.calls.length;

/** Keeps the next round of photo downloads going until the test lets it finish. */
function holdNextPhotos() {
  let finish = () => {};
  jest.mocked(downloadMissingPhotos).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = () => resolve();
      }),
  );
  return () => finish();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.mocked(getSupabase).mockReturnValue(SUPABASE as never);
  jest.mocked(supabasePublicCopyApi).mockReturnValue(SERVER as never);
  // Resets and not just clears, so a held download one test didn't use can't leak into the next.
  jest.mocked(downloadPublicCopy).mockReset().mockResolvedValue('done');
  jest.mocked(downloadMissingPhotos).mockReset().mockResolvedValue(undefined);
  setRecords('visitor');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as typeof appStateListener;
    return { remove: stopAppState } as never;
  });
  jest.mocked(Network.addNetworkStateListener).mockImplementation((listener) => {
    networkListener = listener as typeof networkListener;
    return { remove: stopNetwork } as never;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('when the plant info downloads', () => {
  it.each(MODES)('downloads when the app opens in %s mode', async (mode) => {
    setRecords(mode);
    await renderCopy();
    expect(downloads()).toBe(1);
    expect(jest.mocked(supabasePublicCopyApi).mock.calls[0][0]).toBe(SUPABASE);
    const [server, store] = jest.mocked(downloadPublicCopy).mock.calls[0];
    expect(server).toBe(SERVER);
    expect(store).toEqual({ replacePublicCopy });
  });

  it('waits until someone picks who uses the phone, then downloads', async () => {
    setRecords(null);
    const { result, rerender } = await renderCopy();
    await act(() => result.current.updateNow());
    await settle(30 * MINUTE);
    expect(downloads()).toBe(0);
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    expect(Network.addNetworkStateListener).not.toHaveBeenCalled();

    setRecords('visitor');
    rerender({});
    await settle();
    expect(downloads()).toBe(1);
  });

  it('never downloads in a build with no server settings', async () => {
    jest.mocked(getSupabase).mockReturnValue(null);
    const { result } = await renderCopy();
    expect(result.current.canUpdate).toBe(false);
    await act(() => result.current.updateNow());
    await settle(30 * MINUTE);
    expect(downloads()).toBe(0);
    expect(result.current.message).toBeNull();
    expect(Network.addNetworkStateListener).not.toHaveBeenCalled();
  });

  it('downloads when the app comes back to the front', async () => {
    // A download that didn't work, so the 5 minute wait after one that did doesn't come into it.
    jest.mocked(downloadPublicCopy).mockResolvedValue('failed');
    await renderCopy();
    await act(async () => appStateListener('background'));
    await settle();
    expect(downloads()).toBe(1);

    await act(async () => appStateListener('active'));
    await settle();
    expect(downloads()).toBe(2);
  });

  it('downloads when signal comes back', async () => {
    jest.mocked(downloadPublicCopy).mockResolvedValue('failed');
    await renderCopy();
    await act(async () => networkListener({ isConnected: false }));
    await settle();
    expect(downloads()).toBe(1);

    await act(async () => networkListener({ isConnected: true }));
    await settle();
    expect(downloads()).toBe(2);

    // Still having signal isn't the same as getting it back.
    await act(async () => networkListener({ isConnected: true }));
    await settle();
    expect(downloads()).toBe(2);
  });

  // iOS says whether there's signal as soon as the listener starts, and the app has only just
  // tried to download.
  it("doesn't count the first time the phone says it has signal", async () => {
    jest.mocked(downloadPublicCopy).mockResolvedValue('failed');
    await renderCopy();
    await act(async () => networkListener({ isConnected: true }));
    await settle();
    expect(downloads()).toBe(1);
  });

  // Android says nothing when the app opens with no signal, so the first thing it says can be that
  // signal is back.
  it('counts the first time the phone says it has signal after one found no signal', async () => {
    jest.mocked(downloadPublicCopy).mockResolvedValue('offline');
    await renderCopy();
    expect(downloads()).toBe(1);

    await act(async () => networkListener({ isConnected: true }));
    await settle();
    expect(downloads()).toBe(2);
  });

  it('downloads every 10 minutes while the app is open', async () => {
    await renderCopy();
    expect(downloads()).toBe(1);
    await settle(10 * MINUTE);
    expect(downloads()).toBe(2);
    await settle(20 * MINUTE);
    expect(downloads()).toBe(4);
  });

  it('waits 5 minutes after one that worked, but Update now goes straight away', async () => {
    const { result } = await renderCopy();
    await settle(4 * MINUTE);
    await act(async () => appStateListener('active'));
    await act(async () => networkListener({ isConnected: false }));
    await act(async () => networkListener({ isConnected: true }));
    await settle();
    expect(downloads()).toBe(1);

    await settle(MINUTE);
    await act(async () => appStateListener('active'));
    await settle();
    expect(downloads()).toBe(2);

    await act(() => result.current.updateNow());
    expect(downloads()).toBe(3);
  });

  it('stops listening and downloading once it closes', async () => {
    const { unmount } = await renderCopy();
    unmount();
    expect(stopAppState).toHaveBeenCalledTimes(1);
    expect(stopNetwork).toHaveBeenCalledTimes(1);
    await settle(30 * MINUTE);
    expect(downloads()).toBe(1);
  });
});

describe('one download at a time', () => {
  it('waits for the one going, then goes once more if asked to and that one failed', async () => {
    const finish = holdNextDownload();
    const { result } = await renderCopy();
    expect(result.current.running).toBe(true);
    await act(async () => appStateListener('active'));
    await act(async () => networkListener({ isConnected: false }));
    await act(async () => networkListener({ isConnected: true }));
    await act(() => result.current.updateNow());
    expect(downloads()).toBe(1);

    await act(async () => finish('failed'));
    await settle();
    expect(downloads()).toBe(2);
    await settle(MINUTE);
    expect(downloads()).toBe(2);
  });

  it("doesn't go again when the one going worked, since the copy is new enough", async () => {
    const finish = holdNextDownload();
    await renderCopy();
    await act(async () => appStateListener('active'));
    await act(async () => finish('done'));
    await settle(MINUTE);
    expect(downloads()).toBe(1);
  });
});

describe('the species photos', () => {
  it.each(MODES)('gets the missing ones in %s mode once the plant info updates', async (mode) => {
    setRecords(mode);
    await renderCopy();
    expect(photoRounds()).toBe(1);
    // The real file and database functions, and the signal check of the same server.
    expect(jest.mocked(downloadMissingPhotos).mock.calls[0][0]).toEqual({
      online: SERVER.online,
      loadPhotos: loadPublicPhotos,
      download: downloadSpeciesPhoto,
      saveFile: savePublicPhotoFile,
      deleteFile: deleteSpeciesPhoto,
      removeStray: removeStraySpeciesPhotos,
    });
  });

  it.each(NOT_DONE)("doesn't get any when the plant info download ends %s", async (outcome) => {
    jest.mocked(downloadPublicCopy).mockResolvedValue(outcome);
    const { result } = await renderCopy();
    await act(() => result.current.updateNow());
    expect(downloads()).toBe(2);
    expect(photoRounds()).toBe(0);
  });

  it("doesn't hold up the plant info while the photos come down", async () => {
    holdNextPhotos();
    const { result } = await renderCopy();
    expect(photoRounds()).toBe(1);
    expect(result.current.running).toBe(false);
    expect(result.current.lastOutcome).toBe('done');

    await act(() => result.current.updateNow());
    expect(downloads()).toBe(2);
    expect(result.current.message).toBe('Plant info updated.');
  });

  it('waits for the round going, then goes once more for the updates during it', async () => {
    const finish = holdNextPhotos();
    const { result } = await renderCopy();
    await act(() => result.current.updateNow());
    await act(() => result.current.updateNow());
    expect(downloads()).toBe(3);
    expect(photoRounds()).toBe(1);

    await act(async () => finish());
    await settle();
    expect(photoRounds()).toBe(2);
    await settle(MINUTE);
    expect(photoRounds()).toBe(2);

    // With no round going, the next update starts one straight away.
    await act(() => result.current.updateNow());
    expect(photoRounds()).toBe(3);
  });

  // Reading the saved photos or checking for signal can fail.
  it('warns when a round throws, and still goes again after the next update', async () => {
    const error = new Error('Something went wrong.');
    jest.mocked(downloadMissingPhotos).mockRejectedValueOnce(error);
    const { result } = await renderCopy();
    expect(console.warn).toHaveBeenCalledWith("Couldn't download the species photos.", error);

    await act(() => result.current.updateNow());
    expect(photoRounds()).toBe(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('what it tells people', () => {
  it('shows when a download is going, and how the last one went', async () => {
    const finish = holdNextDownload();
    const { result } = await renderCopy();
    expect(result.current.running).toBe(true);
    expect(result.current.lastOutcome).toBeNull();

    await act(async () => finish('offline'));
    expect(result.current.running).toBe(false);
    expect(result.current.lastOutcome).toBe('offline');

    await act(() => result.current.updateNow());
    expect(result.current.lastOutcome).toBe('done');
  });

  it('says the plant info updated when Update now works, and reads it out', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { result } = await renderCopy();
    await act(() => result.current.updateNow());
    expect(downloads()).toBe(2);
    expect(result.current.message).toBe('Plant info updated.');
    expect(announce).toHaveBeenCalledWith('Plant info updated.');
  });

  it.each<[DownloadOutcome, string]>([
    ['offline', 'No signal right now. The plant info saved on this phone still works.'],
    ['failed', "Couldn't update the plant info, but the copy saved on this phone still works."],
  ])('says the saved copy still works when Update now ends %s', async (outcome, text) => {
    setRecords('visitor', DOWNLOADED);
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { result } = await renderCopy();
    jest.mocked(downloadPublicCopy).mockResolvedValue(outcome);
    await act(() => result.current.updateNow());
    expect(result.current.message).toBe(text);
    expect(announce).toHaveBeenCalledWith(text);
  });

  it.each<[DownloadOutcome, string]>([
    ['offline', 'No signal right now. The plant info will download once this phone is online.'],
    ['failed', "Couldn't download the plant info. Try again in a little while."],
  ])('says what to expect when Update now ends %s with no copy yet', async (outcome, text) => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { result } = await renderCopy();
    jest.mocked(downloadPublicCopy).mockResolvedValue(outcome);
    await act(() => result.current.updateNow());
    expect(result.current.message).toBe(text);
    expect(announce).toHaveBeenCalledWith(text);
  });

  // The time it last worked is on screen already, so there's nothing new to say.
  it.each(NOT_DONE)('says nothing when one it started by itself ends %s', async (outcome) => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    jest.mocked(downloadPublicCopy).mockResolvedValue(outcome);
    const { result } = await renderCopy();
    expect(result.current.lastOutcome).toBe(outcome);
    expect(result.current.message).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('keeps what Update now said until one it started by itself works', async () => {
    const failed = "Couldn't download the plant info. Try again in a little while.";
    jest.mocked(downloadPublicCopy).mockResolvedValue('failed');
    const { result } = await renderCopy();
    await act(() => result.current.updateNow());
    expect(result.current.message).toBe(failed);

    await act(async () => appStateListener('active'));
    await settle();
    expect(downloads()).toBe(3);
    expect(result.current.message).toBe(failed);

    jest.mocked(downloadPublicCopy).mockResolvedValue('done');
    await act(async () => appStateListener('active'));
    await settle();
    expect(downloads()).toBe(4);
    expect(result.current.message).toBeNull();
  });

  it('forgets the message when the phone switches to staff', async () => {
    const { result, rerender } = await renderCopy();
    await act(() => result.current.updateNow());
    expect(result.current.message).toBe('Plant info updated.');

    setRecords('staff');
    rerender({});
    await settle();
    expect(result.current.message).toBeNull();
    // Staff use the same plant info, so switching doesn't download it again.
    expect(downloads()).toBe(2);
  });

  // downloadPublicCopy isn't meant to throw, but if it does the app shouldn't get stuck.
  it('still finishes, and can go again, when a download throws', async () => {
    const error = new Error('Something went wrong.');
    jest.mocked(downloadPublicCopy).mockRejectedValue(error);
    const { result } = await renderCopy();
    expect(console.warn).toHaveBeenCalledWith("Couldn't update the plant info.", error);
    expect(result.current.running).toBe(false);

    await act(() => result.current.updateNow());
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(result.current.message).toBeNull();

    jest.mocked(downloadPublicCopy).mockResolvedValue('done');
    await act(() => result.current.updateNow());
    expect(result.current.message).toBe('Plant info updated.');
  });
});

describe('usePublicCopy', () => {
  it('says what went wrong when used outside the provider', () => {
    // React logs the error as well, which would only clutter the test output.
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePublicCopy())).toThrow(
      'usePublicCopy has to be used inside PublicCopyProvider.',
    );
    logError.mockRestore();
  });
});

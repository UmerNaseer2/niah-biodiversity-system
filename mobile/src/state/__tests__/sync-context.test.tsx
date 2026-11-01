import { act, renderHook } from '@testing-library/react-native';
import * as Network from 'expo-network';
import type { ReactNode } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { getSupabase } from '@/lib/supabase';
import { useAccount } from '@/state/account-context';
import { useRecords } from '@/state/records-context';
import { SyncProvider, useSync } from '@/state/sync-context';
import { runSync, type SyncResult } from '@/sync/sync-engine';

// This file is about when a sync runs and what it tells people. What a sync does is in
// src/sync/__tests__/sync-engine.test.ts.

jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/state/account-context', () => ({ useAccount: jest.fn() }));
jest.mock('@/state/records-context', () => ({ useRecords: jest.fn() }));
jest.mock('@/sync/supabase-api', () => ({ supabaseSyncApi: jest.fn(() => ({})) }));
jest.mock('@/sync/sync-engine', () => ({
  ...jest.requireActual('@/sync/sync-engine'),
  runSync: jest.fn(),
}));

const MINUTE = 60 * 1000;
const FINISHED = '2026-10-31T01:00:00.000Z';

function result(changes: Partial<SyncResult> = {}): SyncResult {
  return {
    outcome: 'done',
    uploaded: 0,
    problems: 0,
    retryLater: 0,
    photosUploaded: 0,
    photoProblems: 0,
    photosRetryLater: 0,
    refreshFailed: false,
    finishedAt: FINISHED,
    ...changes,
  };
}

let appStateListener: (state: string) => void;
let networkListener: (state: { isConnected: boolean }) => void;
const refreshProfile = jest.fn(async () => {});
const loadLastSynced = jest.fn(async (): Promise<string | null> => null);

function setAccount(status: 'signed-in' | 'signed-out') {
  jest.mocked(useAccount).mockReturnValue({ status, refreshProfile } as never);
}

function setWaiting(waitingCount: number, photosWaiting = 0) {
  jest.mocked(useRecords).mockReturnValue({
    waitingCount,
    loadLastSynced,
    photosWaitingFor: () => photosWaiting,
  } as never);
}

function wrapper({ children }: { children: ReactNode }) {
  return <SyncProvider>{children}</SyncProvider>;
}

/** Renders the provider, and lets everything that starts when it opens finish. */
async function renderSync() {
  const hook = renderHook(() => useSync(), { wrapper });
  await settle();
  return hook;
}

async function settle(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

const syncs = () => jest.mocked(runSync).mock.calls.length;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.mocked(getSupabase).mockReturnValue({} as never);
  jest.mocked(runSync).mockResolvedValue(result());
  loadLastSynced.mockResolvedValue(null);
  setAccount('signed-in');
  setWaiting(0);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as typeof appStateListener;
    return { remove: jest.fn() } as never;
  });
  jest.mocked(Network.addNetworkStateListener).mockImplementation((listener) => {
    networkListener = listener as typeof networkListener;
    return { remove: jest.fn() } as never;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('when a sync runs', () => {
  it('runs when the app opens with someone signed in', async () => {
    await renderSync();
    expect(syncs()).toBe(1);
    expect(jest.mocked(runSync).mock.calls[0][2]).toEqual({ retryProblems: false });
  });

  it('never runs with nobody signed in, or in a build with no server settings', async () => {
    setAccount('signed-out');
    setWaiting(3);
    const first = await renderSync();
    await settle(10 * MINUTE);
    first.unmount();
    expect(syncs()).toBe(0);

    setAccount('signed-in');
    jest.mocked(getSupabase).mockReturnValue(null);
    await renderSync();
    await settle(10 * MINUTE);
    expect(syncs()).toBe(0);
  });

  it('runs when someone signs in', async () => {
    setAccount('signed-out');
    const { rerender } = await renderSync();
    expect(syncs()).toBe(0);
    setAccount('signed-in');
    rerender({});
    await settle();
    expect(syncs()).toBe(1);
  });

  it('runs when signal comes back, within the 5 minutes the proposal asks for', async () => {
    setWaiting(1);
    await renderSync();
    expect(syncs()).toBe(1);
    jest.mocked(runSync).mockClear();

    await act(async () => networkListener({ isConnected: false }));

    await settle();
    expect(syncs()).toBe(0);
    await act(async () => networkListener({ isConnected: true }));
    await settle();
    expect(syncs()).toBe(1);
  });

  it("doesn't count the first thing the phone says about signal as it coming back", async () => {
    setWaiting(1);
    await renderSync();
    jest.mocked(runSync).mockClear();
    await act(async () => networkListener({ isConnected: true }));
    await settle();
    expect(syncs()).toBe(0);
  });

  it('runs when the app comes back to the front with records waiting', async () => {
    setWaiting(1);
    await renderSync();
    jest.mocked(runSync).mockClear();
    await act(async () => appStateListener('background'));
    await settle();
    expect(syncs()).toBe(0);
    await act(async () => appStateListener('active'));
    await settle();
    expect(syncs()).toBe(1);
  });

  it('runs when a new record is saved', async () => {
    const { rerender } = await renderSync();
    jest.mocked(runSync).mockClear();
    setWaiting(1);
    rerender({});
    await settle();
    expect(syncs()).toBe(1);
  });

  it('tries every minute while a record is waiting, even if the phone misses signal', async () => {
    setWaiting(1);
    await renderSync();
    jest.mocked(runSync).mockClear();
    await settle(5 * MINUTE);
    expect(syncs()).toBe(5);
  });

  it('tries every minute for photos too, once the record has gone up', async () => {
    setWaiting(0, 2);
    await renderSync();
    jest.mocked(runSync).mockClear();
    await settle(3 * MINUTE);
    expect(syncs()).toBe(3);
  });

  it('counts photos when the app comes back to the front', async () => {
    setWaiting(0, 1);
    await renderSync();
    jest.mocked(runSync).mockClear();
    await act(async () => appStateListener('background'));
    await settle();
    await act(async () => appStateListener('active'));
    await settle();
    expect(syncs()).toBe(1);
  });

  it('stops trying every minute with nothing waiting', async () => {
    await renderSync();
    jest.mocked(runSync).mockClear();
    await settle(5 * MINUTE);
    expect(syncs()).toBe(0);
  });

  it('stops trying every minute if the account is not allowed, since only an admin can fix it', async () => {
    jest.mocked(runSync).mockResolvedValue(result({ outcome: 'not-allowed' }));
    setWaiting(1);
    await renderSync();
    jest.mocked(runSync).mockClear();
    await settle(5 * MINUTE);
    expect(syncs()).toBe(0);
    // Coming back to the app still checks whether the admin has done it.
    await act(async () => appStateListener('active'));
    await settle();
    expect(syncs()).toBe(1);
  });

  it('with nothing waiting, leaves downloads alone for five minutes after the last sync', async () => {
    await renderSync();
    jest.mocked(runSync).mockClear();
    await act(async () => appStateListener('active'));
    await settle();
    expect(syncs()).toBe(0);
    await settle(5 * MINUTE);
    await act(async () => appStateListener('active'));
    await settle();
    expect(syncs()).toBe(1);
  });

  it('only runs one at a time, and goes again if something turned up during it', async () => {
    let finish = (_value: SyncResult) => {};
    jest.mocked(runSync).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    setWaiting(1);
    const { rerender } = await renderSync();
    expect(syncs()).toBe(1);

    setWaiting(2);
    rerender({});
    await settle();
    expect(syncs()).toBe(1);

    await act(async () => {
      finish(result());
    });
    await settle();
    expect(syncs()).toBe(2);
  });
});

describe('pressing Sync now', () => {
  it('tries records with a problem too, and reads the result out', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { result: hook } = await renderSync();
    jest.mocked(runSync).mockClear();
    jest.mocked(runSync).mockResolvedValue(result({ uploaded: 2 }));
    await act(() => hook.current.syncNow());
    expect(jest.mocked(runSync).mock.calls[0][2]).toEqual({ retryProblems: true });
    expect(hook.current.message).toBe('2 records uploaded.');
    expect(announce).toHaveBeenCalledWith('2 records uploaded.');
  });

  it('runs even if a sync finished a moment ago with nothing waiting', async () => {
    const { result: hook } = await renderSync();
    jest.mocked(runSync).mockClear();
    await act(() => hook.current.syncNow());
    expect(syncs()).toBe(1);
  });

  it('says there is no signal, because someone asked', async () => {
    const { result: hook } = await renderSync();
    jest.mocked(runSync).mockResolvedValue(result({ outcome: 'offline' }));
    await act(() => hook.current.syncNow());
    expect(hook.current.message).toMatch(/^Can't reach the server/);
  });

  it("doesn't fall over if the sync throws", async () => {
    const { result: hook } = await renderSync();
    jest.mocked(runSync).mockRejectedValue(new Error('Boom'));
    await act(() => hook.current.syncNow());
    expect(hook.current.running).toBe(false);
  });

  it('shows it is running while it runs', async () => {
    const { result: hook } = await renderSync();
    let finish = (_value: SyncResult) => {};
    jest.mocked(runSync).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    act(() => {
      hook.current.syncNow();
    });
    expect(hook.current.running).toBe(true);
    await act(async () => {
      finish(result());
    });
    expect(hook.current.running).toBe(false);
  });
});

describe('what an automatic sync says', () => {
  it('stays quiet about having no signal', async () => {
    jest.mocked(runSync).mockResolvedValue(result({ outcome: 'offline' }));
    const { result: hook } = await renderSync();
    expect(hook.current.message).toBeNull();
  });

  it.each(['signed-out', 'not-allowed', 'error'] as const)(
    'speaks up about %s, because someone has to do something',
    async (outcome) => {
      jest.mocked(runSync).mockResolvedValue(result({ outcome }));
      const { result: hook } = await renderSync();
      expect(hook.current.message).not.toBeNull();
    },
  );

  it('takes an old message away once a sync works', async () => {
    jest.mocked(runSync).mockResolvedValueOnce(result({ outcome: 'error' }));
    setWaiting(1);
    const { result: hook } = await renderSync();
    expect(hook.current.message).toMatch(/Something went wrong/);
    await settle(MINUTE);
    expect(hook.current.message).toBeNull();
  });

  it('clears the message when the person signs out', async () => {
    jest.mocked(runSync).mockResolvedValue(result({ outcome: 'not-allowed' }));
    const { result: hook, rerender } = await renderSync();
    expect(hook.current.message).not.toBeNull();
    setAccount('signed-out');
    rerender({});
    await settle();
    expect(hook.current.message).toBeNull();
  });

  it('says nothing about a sync that ends after the person signed out', async () => {
    let finish!: (value: SyncResult) => void;
    jest.mocked(runSync).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result: hook, rerender } = await renderSync();
    expect(hook.current.running).toBe(true);

    setAccount('signed-out');
    rerender({});
    await settle();
    await act(async () => finish(result({ outcome: 'signed-out' })));
    await settle();

    expect(hook.current.message).toBeNull();
    expect(hook.current.running).toBe(false);
  });

  it('takes "Nothing new to upload" away when a new record is saved with no signal', async () => {
    const { result: hook, rerender } = await renderSync();
    await act(async () => {
      await hook.current.syncNow();
    });
    expect(hook.current.message).toBe('Nothing new to upload.');

    jest.mocked(runSync).mockResolvedValue(result({ outcome: 'offline' }));
    setWaiting(1);
    rerender({});
    await settle();
    expect(hook.current.message).toBeNull();
  });

  it('keeps the message when a record stops waiting, because that is what it is about', async () => {
    setWaiting(2);
    jest.mocked(runSync).mockResolvedValue(result({ uploaded: 1 }));
    const { result: hook, rerender } = await renderSync();
    await act(async () => {
      await hook.current.syncNow();
    });
    expect(hook.current.message).toBe('1 record uploaded.');

    setWaiting(1);
    rerender({});
    expect(hook.current.message).toBe('1 record uploaded.');
  });
});

describe('last synced', () => {
  it('reads the saved date when the app opens', async () => {
    jest.mocked(runSync).mockResolvedValue(result({ outcome: 'offline' }));
    loadLastSynced.mockResolvedValue('2026-10-30T01:00:00.000Z');
    const { result: hook } = await renderSync();
    expect(hook.current.lastSyncedAt).toBe('2026-10-30T01:00:00.000Z');
  });

  it('only moves when the whole sync worked', async () => {
    jest.mocked(runSync).mockResolvedValue(result({ refreshFailed: true }));
    const { result: hook } = await renderSync();
    expect(hook.current.lastSyncedAt).toBeNull();
    jest.mocked(runSync).mockResolvedValue(result());
    await act(() => hook.current.syncNow());
    expect(hook.current.lastSyncedAt).toBe(FINISHED);
  });
});

describe('the role', () => {
  it('reads it again after a sync, unless there was no signal', async () => {
    await renderSync();
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    refreshProfile.mockClear();
    jest.mocked(runSync).mockResolvedValue(result({ outcome: 'offline' }));
    setWaiting(1);
    const { rerender } = await renderSync();
    rerender({});
    await settle();
    expect(refreshProfile).not.toHaveBeenCalled();
  });
});

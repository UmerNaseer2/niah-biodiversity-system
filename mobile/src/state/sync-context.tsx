import * as Network from 'expo-network';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { announce } from '@/lib/announce';
import { getSupabase } from '@/lib/supabase';
import { useAccount } from '@/state/account-context';
import { useRecords } from '@/state/records-context';
import { supabaseSyncApi } from '@/sync/supabase-api';
import { runSync, syncResultMessage, type SyncResult } from '@/sync/sync-engine';

// Decides when to sync. The proposal's target is that records go up within 5 minutes of signal
// coming back, so nobody has to remember to press anything. It only runs while the app is open,
// which docs/sync-design.md lists under Known limits.

/** How often to try again while a record is waiting. Under the 5 minutes, and costs little. */
const TRY_EVERY_MS = 60 * 1000;

/** With nothing to upload, a sync is only for fresh downloads, which can wait this long. */
const QUIET_FOR_MS = 5 * 60 * 1000;

type SyncContextValue = {
  /** Runs a sync because someone asked for it, trying records that had a problem as well. */
  syncNow: () => Promise<void>;
  running: boolean;
  /** What the last sync worth mentioning came to, for showing near the Sync now button. */
  message: string | null;
  /** When a whole sync last worked (ISO 8601), or null if it never has. */
  lastSyncedAt: string | null;
};

const SyncContext = createContext<SyncContextValue | null>(null);

/** Whether an automatic sync's result needs saying. Having no signal goes without saying. */
function worthMentioning(result: SyncResult) {
  return ['signed-out', 'not-allowed', 'error'].includes(result.outcome);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const records = useRecords();
  const { status, refreshProfile } = useAccount();
  const signedIn = status === 'signed-in';
  const { waitingCount, loadLastSynced } = records;

  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  // What the last person's sync came to isn't any use to whoever signs in next.
  const [wasSignedIn, setWasSignedIn] = useState(signedIn);
  if (wasSignedIn !== signedIn) {
    setWasSignedIn(signedIn);
    setMessage(null);
  }
  // "Nothing new to upload" stops being true as soon as a new record is saved.
  const [seenWaiting, setSeenWaiting] = useState(waitingCount);
  if (seenWaiting !== waitingCount) {
    setSeenWaiting(waitingCount);
    if (waitingCount > seenWaiting) {
      setMessage(null);
    }
  }
  // One sync at a time, and two quick taps can land before the button shows as disabled.
  const busy = useRef(false);
  // Something new turned up during a sync, so go round again once it's done.
  const again = useRef(false);
  const lastFinished = useRef(0);
  const lastOutcome = useRef<SyncResult['outcome'] | null>(null);

  async function run(retryProblems: boolean, manual: boolean) {
    const supabase = getSupabase();
    if (!supabase || !signedIn || busy.current) {
      return;
    }
    busy.current = true;
    setRunning(true);
    try {
      const result = await runSync(supabaseSyncApi(supabase), records, { retryProblems });
      lastFinished.current = Date.now();
      lastOutcome.current = result.outcome;
      if (result.outcome === 'done' && !result.refreshFailed) {
        setLastSyncedAt(result.finishedAt);
      }
      // A sync can take half a minute with no signal, and whoever signed out during it doesn't need
      // telling to sign in again.
      if (!signedInNow.current) {
        return;
      }
      if (manual || worthMentioning(result)) {
        const text = syncResultMessage(result);
        setMessage(text);
        if (manual) {
          announce(text);
        }
      } else if (result.outcome === 'done') {
        // Whatever it said before is out of date now.
        setMessage(null);
      }
      if (result.outcome !== 'offline') {
        await refreshProfile().catch(() => undefined);
      }
    } finally {
      busy.current = false;
      setRunning(false);
    }
    if (again.current) {
      again.current = false;
      setTimeout(() => autoRef.current(), 0);
    }
  }

  function auto() {
    if (busy.current) {
      again.current = true;
      return;
    }
    const recently = Date.now() - lastFinished.current < QUIET_FOR_MS;
    if (waitingCount === 0 && recently) {
      return;
    }
    run(false, false).catch((error: unknown) => {
      console.warn("Couldn't sync.", error);
    });
  }

  // The listeners below stay the same for as long as someone's signed in, so they call whichever
  // version of auto came from the latest render, with the latest counts.
  const autoRef = useRef(auto);
  const signedInNow = useRef(signedIn);
  useEffect(() => {
    autoRef.current = auto;
    signedInNow.current = signedIn;
  });

  useEffect(() => {
    let active = true;
    loadLastSynced()
      .then((value) => {
        if (active) {
          setLastSyncedAt(value);
        }
      })
      .catch((error: unknown) => {
        console.warn("Couldn't read when the phone last synced.", error);
      });
    return () => {
      active = false;
    };
    // Only when the app opens. After that the sync sets it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When someone signs in, and when the app opens with someone already signed in.
  useEffect(() => {
    if (signedIn) {
      autoRef.current();
    }
  }, [signedIn]);

  // When the app comes back to the front, and when signal comes back.
  useEffect(() => {
    if (!signedIn) {
      return;
    }
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        autoRef.current();
      }
    });
    let connected: boolean | undefined;
    const network = Network.addNetworkStateListener(({ isConnected }) => {
      if (isConnected && connected === false) {
        autoRef.current();
      }
      connected = isConnected;
    });
    return () => {
      appState.remove();
      network.remove();
    };
  }, [signedIn]);

  // When a new record is saved, or a record gets sorted out.
  const previousWaiting = useRef(waitingCount);
  useEffect(() => {
    if (waitingCount > previousWaiting.current) {
      autoRef.current();
    }
    previousWaiting.current = waitingCount;
  }, [waitingCount]);

  // Every minute while a record is waiting, in case the phone didn't notice signal coming back.
  const hasWaiting = waitingCount > 0;
  useEffect(() => {
    if (!signedIn || !hasWaiting) {
      return;
    }
    const timer = setInterval(() => {
      // Only an admin can fix this one, and whether they have is checked on the other triggers.
      if (lastOutcome.current !== 'not-allowed') {
        autoRef.current();
      }
    }, TRY_EVERY_MS);
    return () => clearInterval(timer);
  }, [signedIn, hasWaiting]);

  function syncNow() {
    return run(true, true).catch((error: unknown) => {
      console.warn("Couldn't sync.", error);
    });
  }

  return <SyncContext value={{ syncNow, running, message, lastSyncedAt }}>{children}</SyncContext>;
}

export function useSync() {
  const context = use(SyncContext);
  if (!context) {
    throw new Error('useSync has to be used inside SyncProvider.');
  }
  return context;
}

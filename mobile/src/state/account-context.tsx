import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';

import { readSavedAccount, signInMessage, type Account } from '@/lib/account';
import { secureStorage } from '@/lib/secure-storage';
import { getSupabase, SESSION_STORAGE_KEY } from '@/lib/supabase';

// Who's signed in on this phone. The proposal says a botanist signs in once while they have signal
// and can still open the app in the forest, so being signed in can't depend on reaching the server.
// getSession gives null with an expired token and no signal, and can take half a minute to say so,
// so the screens go by the account saved here. The server still checks every request.

const ACCOUNT_KEY = 'niah-account';

export const SESSION_ENDED =
  'Your sign in ended, so sign in again to sync. Your records are safe on this phone.';

export type AccountStatus = 'loading' | 'signed-out' | 'signed-in';

type AccountContextValue = {
  status: AccountStatus;
  account: Account | null;
  /** False in a build that wasn't given the Supabase address and key. */
  configured: boolean;
  /** Set when the sign in ended without the person asking for that. */
  notice: string | null;
  /** Gives the message to show if it didn't work, or null if it did. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Reads the name and role again. If that fails nothing changes, because it isn't urgent. */
  refreshProfile: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

function fromSession(session: Session, saved: Account | null): Account {
  const { id, email } = session.user;
  return saved?.userId === id ? saved : { userId: id, email: email ?? '', name: null, role: null };
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [status, setStatus] = useState<AccountStatus>(supabase ? 'loading' : 'signed-out');
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // So a sign out the person asked for doesn't tell them their sign in ended.
  const signingOut = useRef(false);
  const accountRef = useRef<Account | null>(null);

  function remember(next: Account) {
    accountRef.current = next;
    setAccount(next);
    setStatus('signed-in');
    setNotice(null);
    secureStorage.setItem(ACCOUNT_KEY, JSON.stringify(next)).catch((error: unknown) => {
      console.warn("Couldn't save the account on this phone.", error);
    });
  }

  function forget(message: string | null) {
    accountRef.current = null;
    setAccount(null);
    setStatus('signed-out');
    setNotice(message);
    secureStorage.removeItem(ACCOUNT_KEY).catch((error: unknown) => {
      console.warn("Couldn't remove the account from this phone.", error);
    });
  }

  async function refreshProfile() {
    const current = accountRef.current;
    if (!supabase || !current) {
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('id', current.userId)
      .maybeSingle();
    // Someone else may have signed in while that was on its way.
    if (error || !data || accountRef.current?.userId !== current.userId) {
      return;
    }
    remember({ ...current, name: data.name ?? null, role: data.role ?? null });
  }

  const refreshRef = useRef(refreshProfile);
  const rememberRef = useRef(remember);
  const forgetRef = useRef(forget);
  useEffect(() => {
    refreshRef.current = refreshProfile;
    rememberRef.current = remember;
    forgetRef.current = forget;
  });

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let active = true;

    async function start() {
      const saved = readSavedAccount(await secureStorage.getItem(ACCOUNT_KEY));
      if (!active) {
        return;
      }
      if (saved) {
        // Straight away, because the check below can take a long time with no signal.
        rememberRef.current(saved);
      }
      const { data, error } = await supabase!.auth.getSession();
      if (!active) {
        return;
      }
      if (data.session) {
        const known = data.session.user.id === saved?.userId;
        rememberRef.current(fromSession(data.session, saved));
        if (!known || !saved?.role) {
          refreshRef.current().catch(() => undefined);
        }
      } else if (error && isAuthRetryableFetchError(error)) {
        // No signal. The session is still stored and the token can be refreshed later.
        if (!saved) {
          setStatus('signed-out');
        }
      } else if (saved) {
        forgetRef.current(SESSION_ENDED);
      } else {
        setStatus('signed-out');
      }
    }

    start().catch((error: unknown) => {
      console.warn("Couldn't read the sign in on this phone.", error);
      if (active) {
        setStatus((current) => (current === 'loading' ? 'signed-out' : current));
      }
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Read now, because signOut can finish before the timer below goes off.
      const asked = signingOut.current;
      // Supabase's own lock is held during this callback, and calling it from in here can hang
      // the app, so the work waits until the callback has returned.
      setTimeout(() => {
        if (!active) {
          return;
        }
        if (event === 'SIGNED_OUT') {
          if (!asked) {
            forgetRef.current(SESSION_ENDED);
          }
        } else if (session && session.user.id !== accountRef.current?.userId) {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            rememberRef.current(fromSession(session, null));
            refreshRef.current().catch(() => undefined);
          }
        }
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signIn(email: string, password: string) {
    if (!supabase) {
      return "Sign in isn't set up in this build.";
    }
    let result;
    try {
      result = await supabase.auth.signInWithPassword({ email, password });
    } catch (error) {
      console.warn('Signing in failed.', error);
      return "Sign in isn't working right now. Try again in a minute.";
    }
    const { data, error } = result;
    if (error || !data.session) {
      return error
        ? signInMessage(error)
        : "Sign in isn't working right now. Try again in a minute.";
    }
    remember(fromSession(data.session, null));
    await refreshProfile().catch(() => undefined);
    return null;
  }

  async function signOut() {
    if (!supabase) {
      return;
    }
    signingOut.current = true;
    try {
      // This can come back with an error and leave the session in place, for an expired token with
      // no signal. Signing out has to work in the forest as well, so the session is removed below
      // either way, and on the server it just runs out.
      await supabase.auth.signOut({ scope: 'local' }).catch((error: unknown) => {
        console.warn("Couldn't tell the server about signing out.", error);
      });
      await secureStorage.removeItem(SESSION_STORAGE_KEY).catch((error: unknown) => {
        console.warn("Couldn't remove the session from this phone.", error);
      });
      forget(null);
    } finally {
      signingOut.current = false;
    }
  }

  return (
    <AccountContext
      value={{
        status,
        account,
        configured: Boolean(supabase),
        notice,
        signIn,
        signOut,
        refreshProfile,
      }}>
      {children}
    </AccountContext>
  );
}

export function useAccount() {
  const context = use(AccountContext);
  if (!context) {
    throw new Error('useAccount has to be used inside AccountProvider.');
  }
  return context;
}

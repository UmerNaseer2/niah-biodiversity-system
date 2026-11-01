import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { secureStorage } from '@/lib/secure-storage';
import { getSupabase, SESSION_STORAGE_KEY } from '@/lib/supabase';
import { AccountProvider, SESSION_ENDED, useAccount } from '@/state/account-context';

jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  SESSION_STORAGE_KEY: 'niah-session',
}));

jest.mock('@/lib/secure-storage', () => {
  const items = new Map<string, string>();
  return {
    secureStorage: {
      getItem: jest.fn(async (key: string) => items.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        items.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        items.delete(key);
      }),
      clear: () => items.clear(),
    },
  };
});

const ACCOUNT_KEY = 'niah-account';
const storage = secureStorage as typeof secureStorage & { clear: () => void };

const USER = { id: 'user-1', email: 'ranger@example.test' };
const session = { user: USER, access_token: 'token' };
const profile = { name: 'Rina', role: 'botanist' };
const saved = { userId: USER.id, email: USER.email, name: 'Rina', role: 'botanist' };

type Answer = { data: unknown; error: unknown };

/** A stand-in for the Supabase client, with the answers each test wants. */
function fakeClient(answers: { getSession?: Answer; profile?: Answer } = {}) {
  let listener: (event: string, session: unknown) => void = () => {};
  const client = {
    auth: {
      getSession: jest.fn(
        async () => answers.getSession ?? { data: { session: null }, error: null },
      ),
      signInWithPassword: jest.fn(async () => ({ data: { session }, error: null as unknown })),
      signOut: jest.fn(async () => ({ error: null as unknown })),
      onAuthStateChange: jest.fn((callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
    },
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: jest.fn(async () => answers.profile ?? { data: profile, error: null }),
        }),
      }),
    })),
    fire: (event: string, value: unknown) => listener(event, value),
  };
  jest.mocked(getSupabase).mockReturnValue(client as never);
  return client;
}

function wrapper({ children }: { children: ReactNode }) {
  return <AccountProvider>{children}</AccountProvider>;
}

async function renderAccount() {
  const hook = renderHook(() => useAccount(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).not.toBe('loading'));
  return hook;
}

/** Waits for the work the provider puts off until Supabase's own lock has been let go. */
async function fire(client: ReturnType<typeof fakeClient>, event: string, value: unknown) {
  await act(async () => {
    client.fire(event, value);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  storage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('opening the app', () => {
  it('says a build with no server settings is not set up, and stays signed out', async () => {
    jest.mocked(getSupabase).mockReturnValue(null);
    const { result } = await renderAccount();
    expect(result.current.configured).toBe(false);
    expect(result.current.status).toBe('signed-out');
    expect(await result.current.signIn('a@example.test', 'not-real')).toMatch(/isn't set up/);
  });

  it('is signed out when nobody has signed in on this phone', async () => {
    fakeClient();
    const { result } = await renderAccount();
    expect(result.current.configured).toBe(true);
    expect(result.current.status).toBe('signed-out');
    expect(result.current.notice).toBeNull();
  });

  it('shows the saved account straight away, before the slow check has finished', async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify(saved));
    const client = fakeClient();
    client.auth.getSession.mockReturnValue(new Promise(() => {}));
    const { result } = await renderAccount();
    expect(result.current.status).toBe('signed-in');
    expect(result.current.account).toEqual(saved);
  });

  it('stays signed in with no signal, since an expired token can be refreshed later', async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify(saved));
    fakeClient({
      getSession: {
        data: { session: null },
        error: new AuthRetryableFetchError('Failed to fetch', 0),
      },
    });
    const { result } = await renderAccount();
    await act(async () => {});
    expect(result.current.status).toBe('signed-in');
    expect(result.current.account).toEqual(saved);
    expect(result.current.notice).toBeNull();
    expect(await storage.getItem(ACCOUNT_KEY)).not.toBeNull();
  });

  it('is signed out with no signal if nobody had signed in', async () => {
    fakeClient({
      getSession: {
        data: { session: null },
        error: new AuthRetryableFetchError('Failed to fetch', 0),
      },
    });
    const { result } = await renderAccount();
    expect(result.current.status).toBe('signed-out');
  });

  it('says so if the server ended the sign in while the app was closed', async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify(saved));
    fakeClient();
    const { result } = await renderAccount();
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    expect(result.current.notice).toBe(SESSION_ENDED);
    expect(await storage.getItem(ACCOUNT_KEY)).toBeNull();
  });

  it('reads the name and role for a session it has no account saved for', async () => {
    fakeClient({ getSession: { data: { session }, error: null } });
    const { result } = await renderAccount();
    await waitFor(() => expect(result.current.account?.role).toBe('botanist'));
    expect(result.current.account?.name).toBe('Rina');
    expect(JSON.parse((await storage.getItem(ACCOUNT_KEY))!)).toEqual(saved);
  });

  it("doesn't use another person's saved role for this session", async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify({ ...saved, userId: 'someone-else' }));
    fakeClient({
      getSession: { data: { session }, error: null },
      profile: { data: null, error: { message: 'no signal' } },
    });
    const { result } = await renderAccount();
    await waitFor(() => expect(result.current.account?.userId).toBe(USER.id));
    expect(result.current.account?.role).toBeNull();
  });

  it('still opens if the saved account cannot be read', async () => {
    jest.mocked(secureStorage.getItem).mockRejectedValueOnce(new Error('Locked'));
    fakeClient();
    const { result } = await renderAccount();
    expect(result.current.status).toBe('signed-out');
  });
});

describe('signing in', () => {
  it('gives no message and fills in the name and role when it works', async () => {
    const client = fakeClient();
    const { result } = await renderAccount();
    let message: string | null = 'not yet';
    await act(async () => {
      message = await result.current.signIn('ranger@example.test', 'not-real');
    });
    expect(message).toBeNull();
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ranger@example.test',
      password: 'not-real',
    });
    expect(result.current.status).toBe('signed-in');
    expect(result.current.account).toEqual(saved);
  });

  it('stays signed in if the role cannot be read yet', async () => {
    fakeClient({ profile: { data: null, error: { message: 'no signal' } } });
    const { result } = await renderAccount();
    await act(async () => {
      await result.current.signIn('ranger@example.test', 'not-real');
    });
    expect(result.current.status).toBe('signed-in');
    expect(result.current.account?.role).toBeNull();
  });

  it('gives the right message when it does not work, and stays signed out', async () => {
    const client = fakeClient();
    client.auth.signInWithPassword.mockResolvedValue({
      data: { session: null } as never,
      error: new AuthApiError('Invalid', 400, 'invalid_credentials'),
    });
    const { result } = await renderAccount();
    let message: string | null = null;
    await act(async () => {
      message = await result.current.signIn('ranger@example.test', 'wrong');
    });
    expect(message).toBe("That email and password don't match an active account.");
    expect(result.current.status).toBe('signed-out');
  });

  it("doesn't fall over if the library throws", async () => {
    const client = fakeClient();
    client.auth.signInWithPassword.mockRejectedValue(new Error('Boom'));
    const { result } = await renderAccount();
    let message: string | null = null;
    await act(async () => {
      message = await result.current.signIn('ranger@example.test', 'not-real');
    });
    expect(message).toMatch(/isn't working right now/);
  });

  it('clears the notice that the last sign in ended', async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify(saved));
    fakeClient();
    const { result } = await renderAccount();
    await waitFor(() => expect(result.current.notice).toBe(SESSION_ENDED));
    await act(async () => {
      await result.current.signIn('ranger@example.test', 'not-real');
    });
    expect(result.current.notice).toBeNull();
  });
});

describe('signing out', () => {
  async function signedIn(client = fakeClient()) {
    const hook = await renderAccount();
    await act(async () => {
      await hook.result.current.signIn('ranger@example.test', 'not-real');
    });
    return { ...hook, client };
  }

  it('removes everything from the phone and shows no notice', async () => {
    const { result, client } = await signedIn();
    await storage.setItem(SESSION_STORAGE_KEY, 'the session');
    client.auth.signOut.mockImplementation(async () => {
      client.fire('SIGNED_OUT', null);
      return { error: null };
    });
    await act(async () => {
      await result.current.signOut();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.status).toBe('signed-out');
    expect(result.current.account).toBeNull();
    expect(result.current.notice).toBeNull();
    expect(await storage.getItem(ACCOUNT_KEY)).toBeNull();
    expect(await storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('still works in the forest, when the library gives an error and keeps the session', async () => {
    const { result, client } = await signedIn();
    await storage.setItem(SESSION_STORAGE_KEY, 'the session');
    client.auth.signOut.mockResolvedValue({
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe('signed-out');
    expect(await storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('still works if the library throws', async () => {
    const { result, client } = await signedIn();
    client.auth.signOut.mockRejectedValue(new Error('Boom'));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe('signed-out');
  });
});

describe('things that happen on their own', () => {
  it('tells someone when their sign in ended without them asking', async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify(saved));
    const client = fakeClient({ getSession: { data: { session }, error: null } });
    const { result } = await renderAccount();
    await fire(client, 'SIGNED_OUT', null);
    expect(result.current.status).toBe('signed-out');
    expect(result.current.notice).toBe(SESSION_ENDED);
    expect(await storage.getItem(ACCOUNT_KEY)).toBeNull();
  });

  it('changes nothing when Supabase says the same person signed in again', async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify(saved));
    const client = fakeClient({ getSession: { data: { session }, error: null } });
    const { result } = await renderAccount();
    await waitFor(() => expect(client.auth.getSession).toHaveBeenCalled());
    await fire(client, 'SIGNED_IN', session);
    await fire(client, 'TOKEN_REFRESHED', session);
    expect(result.current.account).toEqual(saved);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('picks up a different person, and never keeps the last one role', async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify(saved));
    const client = fakeClient({
      getSession: { data: { session }, error: null },
      profile: { data: { name: 'Sam', role: 'visitor' }, error: null },
    });
    const { result } = await renderAccount();
    await waitFor(() => expect(client.auth.getSession).toHaveBeenCalled());
    await fire(client, 'SIGNED_IN', { user: { id: 'user-2', email: 'sam@example.test' } });
    await waitFor(() => expect(result.current.account?.name).toBe('Sam'));
    expect(result.current.account).toEqual({
      userId: 'user-2',
      email: 'sam@example.test',
      name: 'Sam',
      role: 'visitor',
    });
  });
});

describe('refreshProfile', () => {
  it('picks up a role an admin changed', async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify({ ...saved, role: 'visitor' }));
    const client = fakeClient({ getSession: { data: { session }, error: null } });
    const { result } = await renderAccount();
    await waitFor(() => expect(client.auth.getSession).toHaveBeenCalled());
    await act(() => result.current.refreshProfile());
    expect(result.current.account?.role).toBe('botanist');
  });

  it('keeps what it had if the server cannot be read', async () => {
    await storage.setItem(ACCOUNT_KEY, JSON.stringify(saved));
    const client = fakeClient({
      getSession: { data: { session }, error: null },
      profile: { data: null, error: { message: 'no signal' } },
    });
    const { result } = await renderAccount();
    await waitFor(() => expect(client.auth.getSession).toHaveBeenCalled());
    await act(() => result.current.refreshProfile());
    expect(result.current.account).toEqual(saved);
  });
});

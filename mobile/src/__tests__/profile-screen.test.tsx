import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SQLite from 'expo-sqlite';

import ProfileScreen from '@/app/(tabs)/profile';
import { DATABASE_NAME } from '@/db/database';
import { openRecordsStore } from '@/db/records-store';
import { getSupabase } from '@/lib/supabase';
import { AccountProvider } from '@/state/account-context';
import { RecordsProvider } from '@/state/records-context';
import { SyncProvider } from '@/state/sync-context';

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  SESSION_STORAGE_KEY: 'niah-session',
}));
jest.mock('@/lib/secure-storage', () => {
  const items = new Map<string, string>();
  return {
    secureStorage: {
      getItem: async (key: string) => items.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        items.set(key, value);
      },
      removeItem: async (key: string) => {
        items.delete(key);
      },
      clear: () => items.clear(),
    },
  };
});

const { secureStorage } = jest.requireMock('@/lib/secure-storage');
const USER = { id: 'user-1', email: 'ranger@example.test' };
const session = { user: USER, access_token: 'token' };
const NOT_REAL = 'not-a-real-one';

function fakeClient(role = 'botanist') {
  // A query that always comes back empty and fine, however it was built.
  const empty = {
    select: () => empty,
    eq: () => empty,
    in: () => empty,
    order: () => empty,
    range: async () => ({ data: [], error: null, status: 200 }),
    insert: async () => ({ error: null, status: 201 }),
    maybeSingle: async () => ({ data: { name: 'Rina', role }, error: null }),
    then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null, status: 200 }),
  };
  const client = {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
      signInWithPassword: jest.fn(async () => ({ data: { session }, error: null as unknown })),
      signOut: jest.fn(async () => ({ error: null })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    from: jest.fn(() => empty),
  };
  jest.mocked(getSupabase).mockReturnValue(client as never);
  return client;
}

function TestLayout() {
  return (
    <AccountProvider>
      <RecordsProvider>
        <SyncProvider>
          <Stack />
        </SyncProvider>
      </RecordsProvider>
    </AccountProvider>
  );
}

function renderProfile() {
  renderRouter({ _layout: TestLayout, index: ProfileScreen }, { initialUrl: '/' });
}

async function signIn() {
  fireEvent.changeText(await screen.findByLabelText(/^Email/), 'ranger@example.test');
  fireEvent.changeText(screen.getByLabelText(/^Password/), NOT_REAL);
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  secureStorage.clear();
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('in a build with no server settings', () => {
  it('says records stay on this phone, and has no form', async () => {
    jest.mocked(getSupabase).mockReturnValue(null);
    renderProfile();
    expect(await screen.findByText(/Sign in isn't set up in this build/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });
});

describe('signing in', () => {
  it('says what is missing, without asking the server', async () => {
    const client = fakeClient();
    renderProfile();
    fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email and password.')).toBeVisible();
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('says who to ask about a forgotten password', async () => {
    fakeClient();
    renderProfile();
    expect(await screen.findByText(/Ask an admin to send you a new link/)).toBeVisible();
  });

  it('shows the message and clears the password when it does not work', async () => {
    const client = fakeClient();
    client.auth.signInWithPassword.mockResolvedValue({
      data: { session: null } as never,
      error: { status: 400 },
    });
    renderProfile();
    await signIn();
    expect(
      await screen.findByText("That email and password don't match an active account."),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Password/).props.value).toBe('');
    expect(screen.getByLabelText(/^Email/).props.value).toBe('ranger@example.test');
  });

  it('shows the name, email and role when it works, and takes the form away', async () => {
    fakeClient();
    renderProfile();
    await signIn();
    expect(await screen.findByText('Rina')).toBeVisible();
    expect(screen.getByText('ranger@example.test')).toBeVisible();
    expect(screen.getByText('Botanist')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByText(/Your account can't upload records yet/)).toBeNull();
  });

  it('warns a visitor that their records will not upload yet', async () => {
    fakeClient('visitor');
    renderProfile();
    await signIn();
    expect(await screen.findByText(/Your account can't upload records yet/)).toBeVisible();
  });
});

describe('signing out', () => {
  it('goes straight away with nothing waiting', async () => {
    const client = fakeClient();
    renderProfile();
    await signIn();
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('warns first with records waiting, since they upload under whoever is next', async () => {
    const client = fakeClient();
    const store = await openRecordsStore();
    await store.saveRecord({
      id: 'b7e3f9d1-2c4a-4e6b-8d0f-1a3c5e7b9d20',
      tagCode: 'NNP-B7E3F9',
      speciesName: 'Ficus benjamina',
      condition: 'healthy',
      photoCount: 0,
      recordedAt: '2026-10-31T01:00:00.000Z',
      syncStatus: 'pending',
    });
    await store.close();
    // The fake client has no session to give the sync, so the record is still waiting at the end.
    renderProfile();
    await signIn();
    await screen.findByText('Rina');
    await act(async () => {});
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/under whoever signs in next/)).toBeVisible();
    fireEvent.press(screen.getByRole('button', { name: 'Keep me signed in' }));
    await waitFor(() => expect(screen.queryByText(/under whoever signs in next/)).toBeNull());
    expect(client.auth.signOut).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out anyway' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(client.auth.signOut).toHaveBeenCalled();
  });

  async function saveUploadedRecordWithPhoto(uploadedBy: string) {
    const store = await openRecordsStore();
    const id = 'c8f4a0e2-3d5b-4f7c-9e1a-2b4d6f8a0c31';
    await store.saveRecord(
      {
        id,
        tagCode: 'NNP-C8F4A0',
        speciesName: 'Ficus benjamina',
        condition: 'healthy',
        photoCount: 1,
        recordedAt: '2026-10-31T01:00:00.000Z',
        syncStatus: 'pending',
      },
      ['record-photos/one.jpg'],
    );
    await store.saveUploadOutcome(id, { kind: 'synced' }, uploadedBy);
    await store.close();
  }

  it('warns first with photos waiting, since only this account can send them', async () => {
    const client = fakeClient();
    await saveUploadedRecordWithPhoto(USER.id);
    renderProfile();
    await signIn();
    await screen.findByText('Rina');
    await act(async () => {});
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByText(
        '1 photo is still waiting, and it only goes up once this account signs in again.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/under whoever signs in next/)).toBeNull();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("doesn't warn about photos that are waiting for a different account", async () => {
    const client = fakeClient();
    await saveUploadedRecordWithPhoto('someone-else');
    renderProfile();
    await signIn();
    await screen.findByText('Rina');
    await act(async () => {});
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(client.auth.signOut).toHaveBeenCalled();
  });
});

describe('the sync card', () => {
  it('counts photos waiting, whichever account they are waiting for', async () => {
    fakeClient();
    const store = await openRecordsStore();
    await store.saveRecord(
      {
        id: 'd9a5b1f3-4e6c-4a8d-8f2b-3c5e7a9b1d42',
        tagCode: 'NNP-D9A5B1',
        speciesName: 'Ficus benjamina',
        condition: 'healthy',
        photoCount: 9,
        recordedAt: '2026-10-31T01:00:00.000Z',
        syncStatus: 'pending',
      },
      Array.from({ length: 9 }, (_, index) => `record-photos/${index}.jpg`),
    );
    await store.saveUploadOutcome(
      'd9a5b1f3-4e6c-4a8d-8f2b-3c5e7a9b1d42',
      { kind: 'synced' },
      'someone-else',
    );
    await store.close();
    renderProfile();
    expect(await screen.findByText('Photos waiting')).toBeVisible();
    expect(screen.getByText('9')).toBeVisible();
  });
});

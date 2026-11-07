import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as Network from 'expo-network';

import { readPhotoBytes } from '@/lib/photo-files';
import { REQUEST_TIME_LIMIT_MS, UPLOAD_TIME_LIMIT_MS, withTimeLimit } from '@/lib/time-limit';

import { downloadMessage, downloadPublicCopy } from '../public-copy';
import { supabaseSyncApi } from '../supabase-api';
import { supabasePublicCopyApi } from '../supabase-public-api';
import { isNoSignal } from '../upload-row';

jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock('@/lib/photo-files', () => ({ readPhotoBytes: jest.fn() }));

// The real supabase-js client, with the same time limit as the app, sending its requests to a
// server that never answers, like on Wi-Fi with no internet behind it. A stopped request fails the
// way it does on the phone, where fetch gives a plain Error and not one named AbortError.
function stalledServer(auth: Record<string, unknown> = {}) {
  const sent: string[] = [];
  const baseFetch = jest.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        sent.push(`${init?.method ?? 'GET'} ${String(input)}`);
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('fetch failed: The operation was aborted.')),
        );
      }),
  );
  const supabase = createClient('http://127.0.0.1:1', 'made-up-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, ...auth },
    global: { fetch: withTimeLimit(baseFetch as unknown as typeof fetch) },
  });
  return { supabase, sent };
}

/** Whether a promise has finished yet, without waiting for it. */
function watch<T>(promise: Promise<T>) {
  const state = { done: false };
  promise.then(
    () => (state.done = true),
    () => (state.done = true),
  );
  return state;
}

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValue({ isConnected: true } as never);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('a server that never answers', () => {
  it('stops Update now after half a minute, and the saved plant info stays', async () => {
    const { supabase, sent } = stalledServer();
    const store = { replacePublicCopy: jest.fn() };
    const outcome = downloadPublicCopy(supabasePublicCopyApi(supabase), store);
    const progress = watch(outcome);

    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS - 1);
    expect(progress.done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toBe('failed');
    expect(downloadMessage(await outcome, true)).toBe(
      "Couldn't update the plant info, but the copy saved on this phone still works.",
    );
    expect(store.replacePublicCopy).not.toHaveBeenCalled();
    // Only the species list was asked for, and it wasn't tried again.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^GET http:\/\/127\.0\.0\.1:1\/rest\/v1\/species_public\?/);
    // A request with no answer is no signal, so nothing gets a warning.
    expect(warn).not.toHaveBeenCalled();
  });

  it('counts a record that got no answer as no signal, so it waits for the next sync', async () => {
    const { supabase, sent } = stalledServer();
    const insert = supabaseSyncApi(supabase).insertRecord({ id: 'made-up' } as never);

    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS);
    const { error, status } = await insert;
    expect(status).toBe(0);
    expect(isNoSignal(error, status)).toBe(true);
    expect(sent).toEqual(['POST http://127.0.0.1:1/rest/v1/records']);
  });

  it('gives a photo upload a minute, then counts it as no signal', async () => {
    jest.mocked(readPhotoBytes).mockResolvedValue(new ArrayBuffer(8));
    const { supabase, sent } = stalledServer();
    const upload = supabaseSyncApi(supabase).uploadPhoto(
      'made-up-record/made-up-photo.jpg',
      'file:///made-up-photo.jpg',
    );
    const progress = watch(upload);

    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS);
    expect(progress.done).toBe(false);
    await jest.advanceTimersByTimeAsync(UPLOAD_TIME_LIMIT_MS - REQUEST_TIME_LIMIT_MS);
    await expect(upload).resolves.toBe('offline');
    expect(sent).toHaveLength(1);
  });

  it('gives up on the reviews and the species list after half a minute', async () => {
    const { supabase, sent } = stalledServer();
    const api = supabaseSyncApi(supabase);
    const reviews = api.fetchReviews(['made-up']);
    const species = api.fetchSpecies();

    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS);
    await expect(reviews).resolves.toBeNull();
    await expect(species).resolves.toBeNull();
    expect(sent).toHaveLength(2);
  });

  it('counts a sign in that needs a new token as offline after half a minute', async () => {
    // A session that ran out an hour ago, so checking it means asking the server for a new token.
    const saved = new Map<string, string>([
      [
        'made-up-session',
        JSON.stringify({
          access_token: 'made-up-access',
          refresh_token: 'made-up-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) - 3600,
          user: { id: 'made-up-user', aud: 'authenticated', app_metadata: {}, user_metadata: {} },
        }),
      ],
    ]);
    const storage: SupportedStorage = {
      getItem: async (name) => saved.get(name) ?? null,
      setItem: async (name, value) => {
        saved.set(name, value);
      },
      removeItem: async (name) => {
        saved.delete(name);
      },
    };
    const { supabase, sent } = stalledServer({
      storage,
      storageKey: 'made-up-session',
      persistSession: true,
    });
    const check = supabaseSyncApi(supabase).session();
    const progress = watch(check);

    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS - 1);
    expect(progress.done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(check).resolves.toBe('offline');
    expect(sent).toEqual(['POST http://127.0.0.1:1/auth/v1/token?grant_type=refresh_token']);
    // No answer isn't the server ending the sign in, so the session stays for the next try.
    expect(saved.has('made-up-session')).toBe(true);
  });
});

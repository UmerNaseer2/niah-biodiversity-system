// supabase.ts reads its settings when it loads, so each test loads a fresh copy.
function loadWith(settings: Record<string, string | undefined>) {
  const createClient = jest.fn(() => ({
    auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() },
  }));
  jest.resetModules();
  jest.doMock('@supabase/supabase-js', () => ({ createClient }));
  Object.assign(process.env, settings);
  const { getSupabase, SESSION_STORAGE_KEY } =
    jest.requireActual<typeof import('@/lib/supabase')>('@/lib/supabase');
  const { secureStorage } =
    jest.requireActual<typeof import('@/lib/secure-storage')>('@/lib/secure-storage');
  return { getSupabase, SESSION_STORAGE_KEY, secureStorage, createClient };
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  jest.dontMock('@supabase/supabase-js');
});

describe('getSupabase', () => {
  it('has no client in a build without the settings, so no test can reach a server', () => {
    const { getSupabase, createClient } = loadWith({});
    expect(getSupabase()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('keeps the session in secure storage, and only makes one client', () => {
    const { getSupabase, SESSION_STORAGE_KEY, secureStorage, createClient } = loadWith({
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'made-up-key',
    });
    const client = getSupabase();
    expect(getSupabase()).toBe(client);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:1', 'made-up-key', {
      auth: {
        storage: secureStorage,
        storageKey: SESSION_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  });
});

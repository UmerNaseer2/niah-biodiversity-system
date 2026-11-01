import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { secureStorage } from './secure-storage';

/** Where Supabase keeps the session in secure storage. */
export const SESSION_STORAGE_KEY = 'niah-session';

// Metro only fills in EXPO_PUBLIC_ values it can see written out in full, so these can't be looked
// up by a name in a variable. Both are safe in the app: the anon key only gets what the Row Level
// Security rules give it. The service role key must never go in an EXPO_PUBLIC_ value.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** The Supabase client, or null in a build that wasn't given the address and key. */
export function getSupabase() {
  if (!client && url && anonKey) {
    client = createClient(url, anonKey, {
      auth: {
        storage: secureStorage,
        storageKey: SESSION_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    const { auth } = client;
    // Only refresh the token while the app is open, as the Supabase guide for Expo says to.
    if (AppState.currentState === 'active') {
      auth.startAutoRefresh();
    }
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        auth.startAutoRefresh();
      } else {
        auth.stopAutoRefresh();
      }
    });
  }
  return client;
}

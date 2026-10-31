import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authConfigured, SUPABASE_URL } from "./config";

// The only place that uses the service role key. It skips Row Level Security,
// so it stays on the server, and it's only for what Supabase Auth won't do for
// a normal sign in: inviting, deactivating and listing accounts. Anything that
// reads or changes a table still uses the normal client in server.ts, so the
// database checks the person asking.
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

export const adminConfigured =
  authConfigured &&
  Boolean(serviceKey) &&
  !serviceKey.includes("your-service-role-key") &&
  !serviceKey.includes("your-server-only-secret-key");

/**
 * Gives Supabase Auth with the service role key, or null when the server
 * doesn't have the key. Only Auth, so it can't be used on a table by mistake.
 * Check the person is an administrator before calling this.
 */
export function authWithServiceKey() {
  if (!adminConfigured) return null;
  return createClient(SUPABASE_URL, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }).auth;
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/** Supabase client for server components and server actions. Uses the anon
 *  key plus the signed in user's cookie, so Row Level Security still applies. */
export async function createClient() {
  if (!authConfigured) {
    throw new Error("Supabase is unavailable: configure a valid HTTPS project URL.");
  }

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, which can't set cookies. The
          // proxy refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  });
}

/** Supabase admin client for administrative tasks. Uses the service role key,
 *  so it bypasses all Row Level Security. Use only for internal admin actions. */
export async function createAdminClient() {
  if (!authConfigured) {
    throw new Error("Supabase is unavailable: configure a valid HTTPS project URL.");
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Supabase admin key is missing: configure SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createServerClient(SUPABASE_URL, serviceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // The admin client is used for API calls, not session management.
      },
    },
  });
}

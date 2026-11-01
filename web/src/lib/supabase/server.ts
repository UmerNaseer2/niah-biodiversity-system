import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  authConfigured,
  SESSION_COOKIE_OPTIONS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  withSessionLife,
} from "./config";

/** Supabase client for server components and server actions. Uses the anon
 *  key plus the signed in user's cookie, so Row Level Security still applies. */
export async function createClient() {
  if (!authConfigured) {
    throw new Error("Supabase is unavailable: configure a valid HTTPS project URL.");
  }

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, withSessionLife(options));
          }
        } catch {
          // Called from a server component, which can't set cookies. The
          // proxy refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  });
}

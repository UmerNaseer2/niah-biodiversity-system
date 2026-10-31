"use server";

import { createClient } from "@supabase/supabase-js";
import {
  authConfigured,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/config";
import { passwordProblem } from "@/lib/users";

export type SetPasswordResult = { ok: boolean; message: string };

const LINK_RAN_OUT =
  "This link has run out. Ask an administrator to send you a new one.";

/**
 * Sets a password with the session from an invite or password link. The session
 * is only kept for this request, so it doesn't sign them in to the website or
 * sign out whoever is using this browser.
 */
export async function setPassword(input: unknown): Promise<SetPasswordResult> {
  if (!authConfigured) {
    return { ok: false, message: "Accounts aren’t set up on this server yet." };
  }
  const raw = (input ?? {}) as Record<string, unknown>;
  const accessToken = typeof raw.accessToken === "string" ? raw.accessToken : "";
  const refreshToken = typeof raw.refreshToken === "string" ? raw.refreshToken : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  const again = typeof raw.again === "string" ? raw.again : "";

  if (!accessToken || !refreshToken) return { ok: false, message: LINK_RAN_OUT };
  const problem = passwordProblem(password, again);
  if (problem) return { ok: false, message: problem };

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const signedIn = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (signedIn.error) return { ok: false, message: LINK_RAN_OUT };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") {
      return { ok: false, message: "That password is too easy to guess. Try a longer one." };
    }
    if (error.code === "same_password") {
      return { ok: false, message: "That’s your old password. Choose a new one." };
    }
    console.error("Setting a password failed:", error.code, error.status);
    return {
      ok: false,
      message: "Your password wasn’t saved. Try again, and if it keeps happening, ask an administrator.",
    };
  }
  return { ok: true, message: "Your password is set." };
}

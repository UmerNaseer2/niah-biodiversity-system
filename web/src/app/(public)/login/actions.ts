"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientAddress, signInLimit } from "@/lib/rate-limit";
import { authConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// The email goes back to the form, so it's still filled in after a failed
// attempt. React clears a form when its action finishes.
export type SignInState = { error: string | null; email: string };

// The same answer for the limit in rate-limit.ts and for Supabase's own.
const TOO_MANY_TRIES = "Too many tries. Wait a few minutes, then try again.";

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!authConfigured) {
    return { error: "Sign in isn’t set up on this server yet.", email };
  }

  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }

  const address = clientAddress(await headers());
  if (signInLimit.isBlocked(email, address)) {
    return { error: TOO_MANY_TRIES, email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429) {
      return { error: TOO_MANY_TRIES, email };
    }
    // Supabase couldn't answer, so it isn't their email or password
    if (!error.status || error.status >= 500) {
      console.error("Signing in failed:", error.code, error.status);
      return { error: "Sign in isn’t working right now. Try again in a minute.", email };
    }
    signInLimit.addFailure(email, address);
    // One message for a wrong email, a wrong password and a deactivated
    // account, so it can't be used to find out which emails have accounts.
    return { error: "That email and password don’t match an active account.", email };
  }

  signInLimit.signedIn(email);
  redirect("/dashboard");
}

export async function signOut() {
  if (authConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

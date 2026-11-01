// Who's signed in on this phone, and what to say when signing in doesn't work. The screens and
// src/state/account-context.tsx use these, and they're apart from it so they're easy to test.
import { isAuthRetryableFetchError } from '@supabase/supabase-js';

export type Account = {
  userId: string;
  email: string;
  name: string | null;
  /** From the profiles table. Null until the phone has managed to read it. */
  role: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  visitor: 'Visitor',
  researcher: 'Researcher',
  botanist: 'Botanist',
  conservation_officer: 'Conservation officer',
  admin: 'Administrator',
};

export function roleLabel(role: string | null) {
  return role ? (ROLE_LABELS[role] ?? role) : 'Not known yet';
}

/**
 * Whether this role can upload records, the same as the rule on the server
 * (supabase/005_phone_sync.sql). The server checks anyway, this is only so the screen can say so.
 * An unknown role gets the benefit of the doubt, because it may only be that there's no signal.
 */
export function canUpload(role: string | null) {
  return role === null || ['botanist', 'conservation_officer', 'admin'].includes(role);
}

/** The saved account, or null if there isn't one or it isn't what the app wrote. */
export function readSavedAccount(text: string | null): Account | null {
  if (!text) {
    return null;
  }
  try {
    const value = JSON.parse(text) as Partial<Account> | null;
    if (typeof value?.userId !== 'string' || typeof value.email !== 'string') {
      return null;
    }
    return {
      userId: value.userId,
      email: value.email,
      name: typeof value.name === 'string' ? value.name : null,
      role: typeof value.role === 'string' ? value.role : null,
    };
  } catch {
    return null;
  }
}

export const NO_SIGNAL_SIGN_IN =
  "There's no signal, and signing in the first time needs it. You can still save records, and " +
  'they stay on this phone until you sign in.';

/**
 * What to say when signing in fails. The same message as the website for a wrong email, a wrong
 * password and a deactivated account, so it can't be used to find out which emails have accounts.
 */
export function signInMessage(error: { status?: number }) {
  // A server that's up but struggling counts as retryable too, and that isn't the same as no signal.
  if (isAuthRetryableFetchError(error) && !error.status) {
    return NO_SIGNAL_SIGN_IN;
  }
  if (error.status === 429) {
    return 'Too many tries. Wait a few minutes, then try again.';
  }
  if (!error.status || error.status >= 500) {
    return "Sign in isn't working right now. Try again in a minute.";
  }
  return "That email and password don't match an active account.";
}

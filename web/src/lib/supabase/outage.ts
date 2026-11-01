import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

/** True when sign in failed because Supabase didn't answer, not because of who
 *  is asking. A retryable error is the network or a 502, 503 or 504. */
export function authIsDown(error: unknown) {
  return (
    isAuthRetryableFetchError(error) ||
    (isAuthError(error) && (error.status ?? 0) >= 500)
  );
}

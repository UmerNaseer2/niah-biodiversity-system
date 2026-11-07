// Every request the app sends to Supabase goes through withTimeLimit, so none of them can wait
// forever. With a weak signal, or Wi-Fi that has no internet behind it, a request can sit there
// with no answer, and Update now or Sync now would keep going for as long as the phone waits. A
// request that runs out of time counts as no signal, like any other request that doesn't get
// through: the plant info saved on the phone stays, and records wait for the next sync.

/** How long a request gets, from when it's sent until the whole answer is back. */
export const REQUEST_TIME_LIMIT_MS = 30_000;

/** A photo upload sends the whole photo, so it gets as long as a species photo download. */
export const UPLOAD_TIME_LIMIT_MS = 60_000;

/** Requests send text or nothing at all, and only a photo upload sends bytes. */
export function timeLimitFor(init?: RequestInit) {
  const body = init?.body;
  return body === undefined || body === null || typeof body === 'string'
    ? REQUEST_TIME_LIMIT_MS
    : UPLOAD_TIME_LIMIT_MS;
}

function tooLong() {
  const error = new Error('The request took too long, so it was stopped.');
  error.name = 'AbortError';
  return error;
}

/**
 * Wraps fetch so a request that takes too long is stopped. The error it throws then is named
 * AbortError, because supabase-js tries a failed read 3 more times unless the request was stopped
 * on purpose, and a server that has stalled would take 4 times as long to give up on.
 */
export function withTimeLimit(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    let timeUp = false;
    // The timer isn't cleared once the server starts answering, because the rest of the answer can
    // still stall on its way down. Stopping a request that has already finished does nothing.
    const timer = setTimeout(() => {
      timeUp = true;
      controller.abort();
    }, timeLimitFor(init));
    // A request that came with its own signal can still be stopped with it.
    const outside = init?.signal;
    if (outside?.aborted) {
      controller.abort();
    } else {
      outside?.addEventListener('abort', () => controller.abort(), { once: true });
    }
    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      throw timeUp ? tooLong() : error;
    }
  };
}

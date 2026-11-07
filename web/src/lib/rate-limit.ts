// Limits on how often sign in can fail, kept in this server's memory. Each
// copy of the server keeps its own counts and a restart clears them, so this
// slows down guessing more than it stops it. Supabase Auth has limits of its
// own as well, and the sign in form says the same thing for both.
//
// This file has no imports, so `npm test` can run it with Node on its own.

export type TryLimit = {
  /** How many failed tries are allowed inside the window. */
  tries: number;
  windowMs: number;
  /** Most names it remembers, so lots of made up emails can't fill the memory. */
  mostNames?: number;
};

/** Counts failed tries for each name, and says when a name has had too many lately. */
export function createTryCounter(limit: TryLimit, now: () => number = Date.now) {
  const mostNames = limit.mostNames ?? 10_000;
  // Each name's failed tries, as times. A name moves to the end when it
  // fails, so the first names are the ones that failed longest ago.
  const failures = new Map<string, number[]>();

  function recent(name: string) {
    const since = now() - limit.windowMs;
    return (failures.get(name) ?? []).filter((time) => time > since);
  }

  /** Forgets names whose tries are all outside the window, and the oldest ones past the most. */
  function makeRoom() {
    const since = now() - limit.windowMs;
    for (const [name, times] of failures) {
      const allOld = times[times.length - 1] <= since;
      if (!allOld && failures.size <= mostNames) return;
      failures.delete(name);
    }
  }

  return {
    /** Whether this name has used up its tries for now. */
    isBlocked(name: string) {
      return recent(name).length >= limit.tries;
    },
    /** Counts a failed try for this name. */
    addFailure(name: string) {
      const times = [...recent(name), now()].slice(-limit.tries);
      failures.delete(name);
      failures.set(name, times);
      makeRoom();
    },
    /** Forgets this name's failed tries. */
    clear(name: string) {
      failures.delete(name);
    },
    /** How many names it remembers right now. */
    get size() {
      return failures.size;
    },
  };
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * The sign in limits. One email gets 5 wrong tries in 15 minutes, which is
 * plenty for someone who forgot their password. One address gets 20 across
 * any emails, so one person can't move on to other accounts.
 */
export function createSignInLimit(now: () => number = Date.now) {
  const emails = createTryCounter({ tries: 5, windowMs: FIFTEEN_MINUTES }, now);
  const addresses = createTryCounter({ tries: 20, windowMs: FIFTEEN_MINUTES }, now);
  const emailName = (email: string) => email.trim().toLowerCase();

  return {
    /** Whether this sign in should be stopped before it's sent to Supabase. */
    isBlocked(email: string, address: string) {
      return emails.isBlocked(emailName(email)) || addresses.isBlocked(address);
    },
    /** Counts a wrong email or password. */
    addFailure(email: string, address: string) {
      emails.addFailure(emailName(email));
      addresses.addFailure(address);
    },
    /** The email worked, so its count starts again. The address keeps its count,
     *  or signing in to your own account would reset it between guesses. */
    signedIn(email: string) {
      emails.clear(emailName(email));
    },
  };
}

/** The address a request came from, as the host in front of the server passes it on. */
export function clientAddress(headers: { get(name: string): string | null }) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** One for the whole server, so every sign in counts towards the same limits. */
export const signInLimit = createSignInLimit();

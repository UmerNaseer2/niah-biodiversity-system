import type { SessionResult } from "./auth.ts";

/** A plain text answer for a download that can't go ahead. */
export function refuse(status: number, message: string) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * The check at the top of each staff CSV route. Gives null for a staff
 * session, or the answer to send back otherwise. The proxy (src/proxy.ts)
 * sends anyone signed out to the sign in page before a route under /dashboard
 * runs, so a route never has to answer a signed out request itself. Anyone
 * else who isn't staff gets a 403.
 */
export function refuseUnlessStaff(
  session: SessionResult,
  what: string,
): Response | null {
  if (session.status === "ok") return null;
  if (session.status === "unavailable") {
    return refuse(503, "The database isn’t answering. Try the download again in a minute.");
  }
  return refuse(403, `Only conservation officers and administrators can download ${what}.`);
}

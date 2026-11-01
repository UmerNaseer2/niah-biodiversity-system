// The Supabase project the site talks to, from .env.local. When it isn't set,
// sign in is off and the public pages use the sample data in src/data.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "";

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

// Permit HTTP only for local development. Never send project credentials or
// user data to a non-TLS Supabase endpoint in a production build.
const secureUrl = (() => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" &&
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname))
    );
  } catch {
    return false;
  }
})();

export const authConfigured = Boolean(
  url &&
    secureUrl &&
    anonKey &&
    !url.includes("your-project-id") &&
    !anonKey.includes("your-anon-key"),
);

// How long a login cookie lasts when nobody uses it. The proxy refreshes the
// session about once an hour on the dashboard, and each refresh starts this
// again, so it only runs out for someone who's gone away.
const SESSION_SECONDS = 12 * 60 * 60;

// Scripts on a page can't read the login cookies, because every Supabase call
// happens on the server. A production build only sends them over https.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

/** @supabase/ssr ignores a maxAge in cookieOptions and sets 400 days on every
 *  cookie, so the life goes on here. A maxAge of 0 is it removing a cookie
 *  at sign out, which stays as it is. */
export function withSessionLife<Options extends { maxAge?: number }>(options: Options) {
  return options.maxAge === 0 ? options : { ...options, maxAge: SESSION_SECONDS };
}

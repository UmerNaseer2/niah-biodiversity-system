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

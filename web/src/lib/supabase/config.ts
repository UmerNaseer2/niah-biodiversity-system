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

export const authConfigured = Boolean(
  url &&
    anonKey &&
    !url.includes("your-project-id") &&
    !anonKey.includes("your-anon-key"),
);

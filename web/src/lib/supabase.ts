import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, authConfigured } from "./supabase/config";

/** Whether the site has a Supabase project to read from */
export const isSupabaseConfigured = authConfigured;

/**
 * Client for the public pages. It uses the anon key with nobody signed in, so
 * it only gets what Row Level Security lets the public see. Null when Supabase
 * isn't set up.
 */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/**
 * The public client, or null when Supabase isn't set up (pages then use the
 * sample data and can be built ahead of time). With Supabase the page renders
 * on every visit, so the records aren't frozen at build time.
 */
export async function publicClient() {
  if (!supabase) return null;
  await connection();
  return supabase;
}

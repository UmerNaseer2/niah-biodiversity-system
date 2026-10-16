import { createClient } from "@supabase/supabase-js";
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

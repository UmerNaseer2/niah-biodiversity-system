import { sqlIsMissing } from "./sql-missing.ts";

/**
 * How the database looked to /health. Only "ok" counts as up. "behind" means it answered but
 * doesn't have species_public (004) yet, "down" means it didn't answer or gave some other error,
 * and "not set up" means the site has no Supabase project in its settings at all.
 */
export type DatabaseState = "ok" | "behind" | "down" | "not set up";

export function databaseState(
  configured: boolean,
  error: { code?: string } | null | undefined,
): DatabaseState {
  if (!configured) return "not set up";
  if (!error) return "ok";
  return sqlIsMissing(error) ? "behind" : "down";
}

/**
 * True when the error means newer SQL isn't in this database yet, rather than something going
 * wrong today. PostgREST says PGRST205 for a table or view it doesn't have and PGRST202 for a
 * function, and Postgres says 42P01, 42883 and 42703 for a missing table, function or column.
 */
export function sqlIsMissing(error: { code?: string } | null | undefined) {
  return ["PGRST202", "PGRST205", "42P01", "42883", "42703"].includes(error?.code ?? "");
}

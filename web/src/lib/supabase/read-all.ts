import type { PostgrestError } from "@supabase/supabase-js";

// How many rows to ask for at once. Hosted Supabase sends at most 1000 rows for
// one request (Max rows in the API settings), whatever the query asks for.
const PAGE = 1000;

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: PostgrestError | null;
  count: number | null;
}>;

/**
 * Every row a query matches, not just the first 1000. It asks for the rows a
 * page at a time and uses the count to know when it has them all, so it still
 * works if Max rows is set lower than PAGE.
 *
 * The query has to ask for the count and sort by something unique last (like
 * the id), or rows could swap places between pages and get missed:
 *
 *   readAll((from, to) =>
 *     supabase.from("records_staff").select("*", { count: "exact" })
 *       .order("recorded_at", { ascending: false }).order("id").range(from, to))
 */
export async function readAll<T>(
  page: (from: number, to: number) => Page<T>,
): Promise<{ data: T[]; error: null } | { data: null; error: PostgrestError }> {
  const rows: T[] = [];
  for (;;) {
    const { data, error, count } = await page(rows.length, rows.length + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    // An empty page means rows were deleted while it was reading, so it stops
    // instead of asking forever. Without a count, a short page is the last one.
    const done = count === null ? (data?.length ?? 0) < PAGE : rows.length >= count;
    if (!data?.length || done) return { data: rows, error: null };
  }
}

// The search box on the staff Records page. The words go to the database as one or() filter, so
// the database does the matching and the page still only reads the one page of records it shows.

/** The longest search we send. Nobody types a note longer than this to find it. */
export const SEARCH_MAX = 80;

/** The columns a search looks in: the tag code, both species names and the notes */
export const SEARCH_COLUMNS = ["tag_code", "species_name", "common_name", "notes"] as const;

/**
 * What someone typed, tidied up, or null when there's nothing to search for. The API reads * in a
 * LIKE pattern as % and a backslash doesn't stop it, so * counts as a space.
 */
export function searchTermFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const term = value.replace(/\*/g, " ").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX).trim();
  return term === "" ? null : term;
}

/** An ILIKE pattern that finds the words anywhere, with % and _ matching only themselves */
export function containsPattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The filter for supabase-js .or(). Each value is in double quotes so commas and brackets in the
 * search can't change the filter, and a backslash or quote inside is escaped with a backslash.
 */
export function searchFilter(term: string) {
  const quoted = `"${containsPattern(term).replace(/["\\]/g, (c) => `\\${c}`)}"`;
  return SEARCH_COLUMNS.map((column) => `${column}.ilike.${quoted}`).join(",");
}

// A later visit to a plant is a new record whose visit_of is the plant's first record, so the
// first record keeps what was seen the first time (supabase/028_record_visits.sql). The public
// only sees the link through record_visits_public, and only when both records are approved.

/** The record IDs in rows from record_visits_public, once each, skipping anything that isn't one */
export function visitIds(rows: readonly { id?: unknown }[] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    if (typeof row.id === "string" && row.id) ids.add(row.id);
  }
  return [...ids];
}

/**
 * Newest first. Two from the same day (hidden plants all get midnight) go by ID, so the list
 * doesn't move around between loads. It doesn't change the list it's given.
 */
export function newestVisitsFirst<T extends { id: string; recordedAt: string }>(
  visits: readonly T[],
): T[] {
  return [...visits].sort(
    (a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id),
  );
}

/** The records that aren't later visits, in the order they came. A visit is the same plant. */
export function withoutVisits<T extends { id: string }>(
  records: readonly T[],
  visits: ReadonlySet<string>,
): T[] {
  return records.filter((record) => !visits.has(record.id));
}

/**
 * How many plants each species has, keyed by slug, from rows of records_public. A later visit is
 * the same plant again, so it doesn't count, and a plant with no species yet doesn't count
 * towards any species.
 */
export function plantsPerSpecies(
  rows: readonly { id?: unknown; species_slug?: unknown }[],
  visits: ReadonlySet<string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!row.species_slug) continue;
    if (typeof row.id === "string" && visits.has(row.id)) continue;
    const slug = String(row.species_slug);
    counts[slug] = (counts[slug] ?? 0) + 1;
  }
  return counts;
}

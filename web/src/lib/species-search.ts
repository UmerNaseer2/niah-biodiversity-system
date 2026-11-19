// The species suggested under the Species box on the record edit page. It works the same as the
// phone's New Record form (mobile/src/lib/species-search.ts): capitals and extra spaces don't
// count, and typing the start of any word in the scientific name or a common name finds it.

/** A species the form can suggest. Names only, never a location. */
export type SpeciesOption = {
  /** The same as species.id in Supabase */
  slug: string;
  scientificName: string;
  /** The first one is the one the form fills in */
  commonNames: string[];
};

// One letter matches half the list, so suggestions start from the second letter
export const MIN_QUERY_LENGTH = 2;
export const MAX_SUGGESTIONS = 5;

/** Lowercase with single spaces, so " Shorea  MACROPHYLLA " matches "Shorea macrophylla" */
export function normaliseName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The species whose scientific name is exactly what was typed, ignoring capitals and spaces */
export function findSpeciesByName(name: string, list: readonly SpeciesOption[]) {
  const query = normaliseName(name);
  if (query === "") return undefined;
  return list.find((option) => normaliseName(option.scientificName) === query);
}

/** True if the name starts with the query, or one of its words does ("macro", "ironwood") */
function startsAWord(name: string, query: string) {
  const normalised = normaliseName(name);
  return (
    normalised.startsWith(query) ||
    normalised.split(/[\s-]+/).some((word) => word.startsWith(query))
  );
}

/**
 * Species to suggest for what was typed. Scientific name matches come first, then common name
 * matches, each in the order of the list.
 */
export function searchSpecies(text: string, list: readonly SpeciesOption[]) {
  const query = normaliseName(text);
  if (query.length < MIN_QUERY_LENGTH) return [];
  const byScientificName = list.filter((option) => startsAWord(option.scientificName, query));
  const byCommonName = list.filter(
    (option) =>
      !byScientificName.includes(option) &&
      option.commonNames.some((name) => startsAWord(name, query)),
  );
  return [...byScientificName, ...byCommonName].slice(0, MAX_SUGGESTIONS);
}

/** A species_staff row as a suggestion, or null when it has no name to show */
export function speciesOptionFromRow(row: Record<string, unknown>): SpeciesOption | null {
  const slug = typeof row.id === "string" ? row.id : "";
  const scientificName = typeof row.scientific_name === "string" ? row.scientific_name.trim() : "";
  if (!slug || !scientificName) return null;
  const commonNames = Array.isArray(row.common_names)
    ? row.common_names.filter((name): name is string => typeof name === "string" && name.trim() !== "")
    : [];
  return { slug, scientificName, commonNames };
}

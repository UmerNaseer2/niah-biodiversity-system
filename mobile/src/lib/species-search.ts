import { SPECIES_LIST, type SpeciesOption } from '@/data/species-list';

// One letter matches half the list, so suggestions start from the second letter.
const MIN_QUERY_LENGTH = 2;
export const MAX_SUGGESTIONS = 4;

/** Lowercase with single spaces, so " Shorea  MACROPHYLLA " matches "Shorea macrophylla". */
export function normaliseName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The species whose scientific name is exactly what was typed, ignoring case and extra spaces. */
export function findSpeciesByName(name: string, list: SpeciesOption[] = SPECIES_LIST) {
  const query = normaliseName(name);
  if (query === '') {
    return undefined;
  }
  return list.find((option) => normaliseName(option.scientificName) === query);
}

/** True if the name starts with the query, or one of its words does ("macro", "ironwood"). */
function startsAWord(name: string, query: string) {
  const normalised = normaliseName(name);
  const words = normalised.split(/[\s-]+/);
  return normalised.startsWith(query) || words.some((word) => word.startsWith(query));
}

/**
 * Species to suggest under the Species box. Typing part of the scientific name or any common
 * name works, so "shor", "engk" and "ironwood" all find something. Scientific name matches come
 * first, then the list order.
 */
export function searchSpecies(text: string, list: SpeciesOption[] = SPECIES_LIST) {
  const query = normaliseName(text);
  if (query.length < MIN_QUERY_LENGTH) {
    return [];
  }
  const byScientificName = list.filter((option) => startsAWord(option.scientificName, query));
  const byCommonName = list.filter(
    (option) =>
      !byScientificName.includes(option) &&
      option.commonNames.some((name) => startsAWord(name, query)),
  );
  return [...byScientificName, ...byCommonName].slice(0, MAX_SUGGESTIONS);
}

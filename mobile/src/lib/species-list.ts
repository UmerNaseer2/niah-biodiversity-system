import { plural } from '@/lib/format';
import { isThreatened } from '@/lib/iucn';
import type { PublicRecord, PublicSpecies } from '@/types/public-copy';

// Works out the Plants tab the same way as the website's plant list
// (web/src/app/(public)/plants/plant-search.tsx), so a search finds the same plants on both.

export type PlantFilter = 'all' | 'threatened' | 'not-threatened';

/** The same choices as the website's plant list. */
export const PLANT_FILTERS: readonly { value: PlantFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'threatened', label: 'Threatened' },
  { value: 'not-threatened', label: 'Not threatened' },
];

export type PlantSummary = {
  species: PublicSpecies;
  /** The first common name, or the Latin name when it has none. */
  name: string;
  /** The rest of its common names. */
  otherNames: string[];
  /** How many tagged plants of it are in the plant info. */
  tagged: number;
};

/** Every species by Latin name, with how many tagged plants of each there are. */
export function plantSummaries(
  species: readonly PublicSpecies[],
  records: readonly PublicRecord[],
): PlantSummary[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.speciesSlug) {
      counts.set(record.speciesSlug, (counts.get(record.speciesSlug) ?? 0) + 1);
    }
  }
  return [...species]
    .sort((a, b) => compareText(a.scientificName, b.scientificName) || compareText(a.slug, b.slug))
    .map((item) => ({
      species: item,
      name: item.commonNames[0] ?? item.scientificName,
      otherNames: item.commonNames.slice(1),
      tagged: counts.get(item.slug) ?? 0,
    }));
}

/** A plain compare instead of localeCompare, so the order is the same on every phone. */
function compareText(a: string, b: string) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** True when every word typed is somewhere in the plant's names or its family. */
function matchesSearch(plant: PlantSummary, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [
    plant.name,
    ...plant.otherNames,
    plant.species.scientificName,
    plant.species.newerName ?? '',
    plant.species.family,
  ]
    .join(' ')
    .toLowerCase();
  return words.every((word) => text.includes(word));
}

/** The plants that match the search and the conservation status filter. */
export function filterPlants(plants: readonly PlantSummary[], query: string, filter: PlantFilter) {
  return plants.filter(
    (plant) =>
      matchesSearch(plant, query) &&
      (filter === 'all' || (filter === 'threatened') === isThreatened(plant.species.iucnCode)),
  );
}

/** The line above the list that says how many plants it shows. */
export function plantsStatus(total: number, shown: number) {
  if (total === 0) {
    return 'No plants yet';
  }
  if (shown === total) {
    return `Showing all ${plural(total, 'plant')}`;
  }
  if (shown === 0) {
    return 'No plants match';
  }
  return `Showing ${shown} of ${plural(total, 'plant')}`;
}

/** The tagged plants of one species, newest first. */
export function taggedPlants(records: readonly PublicRecord[], slug: string) {
  return records
    .filter((record) => record.speciesSlug === slug)
    .sort(
      (a, b) =>
        Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || compareText(a.tagCode, b.tagCode),
    );
}

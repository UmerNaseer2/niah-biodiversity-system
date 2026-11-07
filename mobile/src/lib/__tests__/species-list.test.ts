import {
  filterPlants,
  PLANT_FILTERS,
  plantsStatus,
  plantSummaries,
  taggedPlants,
  type PlantFilter,
} from '@/lib/species-list';
import type { PublicRecord, PublicSpecies } from '@/types/public-copy';

// Made-up species and plants. Like the rest of the saved plant info, the plants have no location.
function species(
  changes: Partial<PublicSpecies> & Pick<PublicSpecies, 'slug' | 'scientificName'>,
): PublicSpecies {
  return {
    authority: '',
    family: '',
    commonNames: [],
    iucnCode: 'NE',
    sarawakProtected: false,
    summary: '',
    about: '',
    habitat: '',
    uses: '',
    ...changes,
  };
}

const PITCHER = species({
  slug: 'nepenthes-rafflesiana',
  scientificName: 'Nepenthes rafflesiana',
  authority: 'Jack',
  family: 'Nepenthaceae',
  commonNames: ['Raffles pitcher plant', 'Periuk kera'],
  iucnCode: 'LC',
  sarawakProtected: true,
  summary: 'A pitcher plant that traps insects.',
});

const FIG = species({
  slug: 'ficus-benjamina',
  scientificName: 'Ficus benjamina',
  family: 'Moraceae',
});

const BELIAN = species({
  slug: 'eusideroxylon-zwageri',
  scientificName: 'Eusideroxylon zwageri',
  family: 'Lauraceae',
  commonNames: ['Belian', 'Borneo ironwood'],
  iucnCode: 'VU',
});

const ENGKABANG = species({
  slug: 'shorea-macrophylla',
  scientificName: 'Shorea macrophylla',
  family: 'Dipterocarpaceae',
  commonNames: ['Engkabang'],
  iucnCode: 'EN',
  newerName: 'Rubroshorea macrophylla',
});

// Its ID sorts in a different place from its Latin name, so the list can't be in ID order.
const KAPUR = species({
  slug: 'kapur',
  scientificName: 'Dryobalanops aromatica',
  family: 'Dipterocarpaceae',
  commonNames: ['Kapur', 'Borneo camphor'],
  iucnCode: 'CR',
});

const SPECIES = [PITCHER, FIG, BELIAN, ENGKABANG, KAPUR];

/** Every species in Latin name order, which is how the Plants tab lists them. */
const LATIN_ORDER = [
  'kapur',
  'eusideroxylon-zwageri',
  'ficus-benjamina',
  'nepenthes-rafflesiana',
  'shorea-macrophylla',
];

function plant(changes: Partial<PublicRecord> = {}): PublicRecord {
  return {
    id: 'e1a2b3c4-5d6e-4f70-8a9b-0c1d2e3f4a51',
    tagCode: 'NNP-E1A2B3',
    speciesSlug: 'nepenthes-rafflesiana',
    speciesName: 'Nepenthes rafflesiana',
    recordedAt: '2026-10-20T02:30:00.000Z',
    ...changes,
  };
}

const OLD_PITCHER = plant();

// Two pitcher plants recorded at the same time, in reverse tag order.
const NEW_PITCHER_LATER_TAG = plant({
  id: '4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c71',
  tagCode: 'NNP-4A5B6C',
  recordedAt: '2026-10-22T03:15:00.000Z',
});

const NEW_PITCHER_EARLIER_TAG = plant({
  id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f62',
  tagCode: 'NNP-2D3E4F',
  recordedAt: '2026-10-22T03:15:00.000Z',
});

const BELIAN_PLANT = plant({
  id: '6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b93',
  tagCode: 'NNP-6F7A8B',
  speciesSlug: 'eusideroxylon-zwageri',
  speciesName: 'Eusideroxylon zwageri',
  recordedAt: '2026-10-21T01:00:00.000Z',
});

// The field team couldn't tell the species, so this plant isn't matched to one.
const UNMATCHED_FIG = plant({
  id: '9b8c7d6e-1f2a-4b3c-8d4e-5f6a7b8c9d02',
  tagCode: 'NNP-9B8C7D',
  speciesSlug: undefined,
  speciesName: 'Ficus sp.',
});

const RECORDS = [
  OLD_PITCHER,
  BELIAN_PLANT,
  NEW_PITCHER_LATER_TAG,
  UNMATCHED_FIG,
  NEW_PITCHER_EARLIER_TAG,
];

describe('plantSummaries', () => {
  it('lists every species by Latin name, not by its ID or common name', () => {
    const summaries = plantSummaries(SPECIES, RECORDS);
    expect(summaries.map((plant) => plant.species.slug)).toEqual(LATIN_ORDER);
    expect(summaries[0].species).toBe(KAPUR);
  });

  it('puts species with the same Latin name in ID order', () => {
    const second = species({ slug: 'ficus-sp-b', scientificName: 'Ficus sp.' });
    const first = species({ slug: 'ficus-sp-a', scientificName: 'Ficus sp.' });
    const slugs = plantSummaries([second, first], []).map((plant) => plant.species.slug);
    expect(slugs).toEqual(['ficus-sp-a', 'ficus-sp-b']);
  });

  it("doesn't change the order of the list it was given", () => {
    const list = [PITCHER, KAPUR];
    plantSummaries(list, []);
    expect(list).toEqual([PITCHER, KAPUR]);
  });

  it('names each plant by its first common name, or its Latin name when it has none', () => {
    const [fig, pitcher, engkabang] = plantSummaries([PITCHER, FIG, ENGKABANG], []);
    expect(pitcher).toMatchObject({ name: 'Raffles pitcher plant', otherNames: ['Periuk kera'] });
    expect(fig).toMatchObject({ name: 'Ficus benjamina', otherNames: [] });
    expect(engkabang).toMatchObject({ name: 'Engkabang', otherNames: [] });
  });

  it('counts the tagged plants of each species', () => {
    const counts = plantSummaries(SPECIES, RECORDS).map((plant) => [
      plant.species.slug,
      plant.tagged,
    ]);
    expect(counts).toEqual([
      ['kapur', 0],
      ['eusideroxylon-zwageri', 1],
      ['ficus-benjamina', 0],
      ['nepenthes-rafflesiana', 3],
      ['shorea-macrophylla', 0],
    ]);
  });

  it('skips plants matched to a species that is missing from the list', () => {
    const lost = plant({ speciesSlug: 'dryobalanops-beccarii', speciesName: 'Dryobalanops' });
    const summaries = plantSummaries([PITCHER], [OLD_PITCHER, lost, UNMATCHED_FIG]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ species: PITCHER, tagged: 1 });
  });

  it('gives nothing when there are no species yet', () => {
    expect(plantSummaries([], RECORDS)).toEqual([]);
  });
});

describe('filterPlants', () => {
  const PLANTS = plantSummaries(SPECIES, RECORDS);

  function shown(query: string, filter: PlantFilter = 'all') {
    return filterPlants(PLANTS, query, filter).map((plant) => plant.species.slug);
  }

  it('shows every plant when nothing is typed', () => {
    expect(shown('')).toEqual(LATIN_ORDER);
    expect(shown('   ')).toEqual(LATIN_ORDER);
  });

  it('finds plants by any of their common names', () => {
    expect(shown('pitcher')).toEqual(['nepenthes-rafflesiana']);
    expect(shown('periuk')).toEqual(['nepenthes-rafflesiana']);
    expect(shown('ironwood')).toEqual(['eusideroxylon-zwageri']);
    expect(shown('borneo')).toEqual(['kapur', 'eusideroxylon-zwageri']);
  });

  it('finds plants by Latin name, newer name or family', () => {
    expect(shown('zwageri')).toEqual(['eusideroxylon-zwageri']);
    expect(shown('rubroshorea')).toEqual(['shorea-macrophylla']);
    expect(shown('moraceae')).toEqual(['ficus-benjamina']);
    expect(shown('dipterocarpaceae')).toEqual(['kapur', 'shorea-macrophylla']);
  });

  it('finds part of a name and ignores capital letters', () => {
    expect(shown('nepen')).toEqual(['nepenthes-rafflesiana']);
    expect(shown('BELIAN')).toEqual(['eusideroxylon-zwageri']);
    expect(shown('Ficus Benjamina')).toEqual(['ficus-benjamina']);
  });

  it('needs every word typed, in any order, with any spaces between them', () => {
    expect(shown('borneo camphor')).toEqual(['kapur']);
    expect(shown('camphor borneo')).toEqual(['kapur']);
    expect(shown('  borneo   ironwood ')).toEqual(['eusideroxylon-zwageri']);
    expect(shown('borneo pitcher')).toEqual([]);
  });

  it('only looks at the names and the family, like the website', () => {
    expect(shown('jack')).toEqual([]);
    expect(shown('insects')).toEqual([]);
    expect(shown('ficus-benjamina')).toEqual([]);
  });

  it('shows Vulnerable, Endangered and Critically Endangered plants as threatened', () => {
    expect(shown('', 'threatened')).toEqual([
      'kapur',
      'eusideroxylon-zwageri',
      'shorea-macrophylla',
    ]);
  });

  it('shows the rest as not threatened', () => {
    expect(shown('', 'not-threatened')).toEqual(['ficus-benjamina', 'nepenthes-rafflesiana']);
  });

  it('only shows plants that match both the search and the filter', () => {
    expect(shown('dipterocarpaceae', 'threatened')).toEqual(['kapur', 'shorea-macrophylla']);
    expect(shown('dipterocarpaceae', 'not-threatened')).toEqual([]);
    expect(shown('nepenthes', 'not-threatened')).toEqual(['nepenthes-rafflesiana']);
    expect(shown('nepenthes', 'threatened')).toEqual([]);
  });
});

describe('PLANT_FILTERS', () => {
  it('has the same choices as the website, in the same order', () => {
    expect(PLANT_FILTERS).toEqual([
      { value: 'all', label: 'All' },
      { value: 'threatened', label: 'Threatened' },
      { value: 'not-threatened', label: 'Not threatened' },
    ]);
  });
});

// The same lines as the website's plant list.
describe('plantsStatus', () => {
  it('says when there are no plants yet', () => {
    expect(plantsStatus(0, 0)).toBe('No plants yet');
  });

  it('says when every plant shows', () => {
    expect(plantsStatus(5, 5)).toBe('Showing all 5 plants');
    expect(plantsStatus(1, 1)).toBe('Showing all 1 plant');
  });

  it('says when no plants match', () => {
    expect(plantsStatus(5, 0)).toBe('No plants match');
    expect(plantsStatus(1, 0)).toBe('No plants match');
  });

  it('says how many of the plants show', () => {
    expect(plantsStatus(5, 2)).toBe('Showing 2 of 5 plants');
    expect(plantsStatus(2, 1)).toBe('Showing 1 of 2 plants');
  });
});

describe('taggedPlants', () => {
  function tags(records: readonly PublicRecord[]) {
    return records.map((record) => record.tagCode);
  }

  it('lists the tagged plants of one species, newest first', () => {
    expect(tags(taggedPlants(RECORDS, 'nepenthes-rafflesiana'))).toEqual([
      'NNP-2D3E4F',
      'NNP-4A5B6C',
      'NNP-E1A2B3',
    ]);
    expect(tags(taggedPlants(RECORDS, 'eusideroxylon-zwageri'))).toEqual(['NNP-6F7A8B']);
  });

  it('puts plants recorded at the same time in tag order', () => {
    const plants = taggedPlants(
      [NEW_PITCHER_LATER_TAG, NEW_PITCHER_EARLIER_TAG],
      'nepenthes-rafflesiana',
    );
    expect(tags(plants)).toEqual(['NNP-2D3E4F', 'NNP-4A5B6C']);
  });

  it("doesn't change the order of the list it was given", () => {
    const list = [OLD_PITCHER, NEW_PITCHER_LATER_TAG];
    taggedPlants(list, 'nepenthes-rafflesiana');
    expect(list).toEqual([OLD_PITCHER, NEW_PITCHER_LATER_TAG]);
  });

  it('gives nothing for a species with no tagged plants', () => {
    expect(taggedPlants(RECORDS, 'ficus-benjamina')).toEqual([]);
    expect(taggedPlants([], 'nepenthes-rafflesiana')).toEqual([]);
  });
});

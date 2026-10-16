import { SPECIES_LIST } from '@/data/species-list';
import {
  findSpeciesByName,
  MAX_SUGGESTIONS,
  normaliseName,
  searchSpecies,
} from '@/lib/species-search';

const names = (text: string) => searchSpecies(text).map((option) => option.scientificName);

describe('searchSpecies', () => {
  it('waits for 2 letters before suggesting anything', () => {
    expect(searchSpecies('')).toEqual([]);
    expect(searchSpecies('s')).toEqual([]);
    expect(searchSpecies(' s ')).toEqual([]);
    expect(names('sh')).toEqual(['Shorea macrophylla']);
  });

  it('finds a species from the start of its scientific name, in any case', () => {
    expect(names('SHOREA')).toEqual(['Shorea macrophylla']);
    expect(names('shorea mac')).toEqual(['Shorea macrophylla']);
  });

  it('finds a species from the start of any word in its name', () => {
    expect(names('macro')).toEqual(['Shorea macrophylla']);
    expect(names('ironwood')).toEqual(['Eusideroxylon zwageri']);
    expect(names('fleshed')).toEqual(['Durio graveolens']);
  });

  it('finds a species from a local name', () => {
    expect(names('belian')).toEqual(['Eusideroxylon zwageri']);
    expect(names('engkabang')).toEqual(['Shorea macrophylla']);
    expect(names('durian kun')).toEqual(['Durio graveolens']);
  });

  it('puts scientific name matches before common name matches', () => {
    const list = [
      { slug: 'alpha-one', scientificName: 'Alpha one', commonNames: ['Beta tree'] },
      { slug: 'beta-two', scientificName: 'Beta two', commonNames: ['Gamma'] },
    ];
    const found = searchSpecies('beta', list).map((option) => option.slug);
    expect(found).toEqual(['beta-two', 'alpha-one']);
  });

  it('does not suggest the same species twice', () => {
    // "Durio graveolens" and its common name "Durian kuning" both start with "du".
    expect(names('du')).toEqual(['Durio graveolens']);
  });

  it('never suggests more than the limit', () => {
    const list = ['one', 'two', 'three', 'four', 'five', 'six'].map((word) => ({
      slug: `tree-${word}`,
      scientificName: `Tree ${word}`,
      commonNames: [`Tree ${word}`],
    }));
    expect(searchSpecies('tree', list)).toHaveLength(MAX_SUGGESTIONS);
    expect(searchSpecies('tree', list)[0].slug).toBe('tree-one');
  });

  it('does not match the middle of a word', () => {
    expect(names('horea')).toEqual([]);
    expect(names('zzz')).toEqual([]);
  });
});

describe('findSpeciesByName', () => {
  it('matches the full scientific name, ignoring case and extra spaces', () => {
    expect(findSpeciesByName('Shorea macrophylla')?.slug).toBe('shorea-macrophylla');
    expect(findSpeciesByName('  shorea   MACROPHYLLA ')?.slug).toBe('shorea-macrophylla');
  });

  it('does not treat part of a name or a common name as a match', () => {
    expect(findSpeciesByName('Shorea')).toBeUndefined();
    expect(findSpeciesByName('Belian')).toBeUndefined();
    expect(findSpeciesByName('')).toBeUndefined();
  });
});

describe('normaliseName', () => {
  it('lowercases and squashes spaces', () => {
    expect(normaliseName('  Nepenthes\tAMPULLARIA ')).toBe('nepenthes ampullaria');
  });
});

describe('SPECIES_LIST', () => {
  it('has no repeated slugs or scientific names', () => {
    const slugs = SPECIES_LIST.map((option) => option.slug);
    const scientific = SPECIES_LIST.map((option) => normaliseName(option.scientificName));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(scientific).size).toBe(scientific.length);
  });

  // The species table in Supabase uses the same slugs, like "shorea-macrophylla".
  it('builds each slug from the scientific name', () => {
    SPECIES_LIST.forEach((option) => {
      expect(option.slug).toBe(normaliseName(option.scientificName).replace(/ /g, '-'));
    });
  });

  it('gives every species a common name to fill in', () => {
    SPECIES_LIST.forEach((option) => expect(option.commonNames.length).toBeGreaterThan(0));
  });
});

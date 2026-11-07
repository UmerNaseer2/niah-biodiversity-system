import { hasCommonName, plantName, speciesOf } from '@/lib/plant-info';
import type { PublicRecord, PublicSpecies } from '@/types/public-copy';

// Made-up species and plants. Like the rest of the saved plant info, the plants have no location.
const PITCHER: PublicSpecies = {
  slug: 'nepenthes-rafflesiana',
  scientificName: 'Nepenthes rafflesiana',
  authority: 'Jack',
  family: 'Nepenthaceae',
  commonNames: ['Raffles pitcher plant', 'Periuk kera'],
  iucnCode: 'LC',
  sarawakProtected: true,
  summary: 'A pitcher plant that traps insects.',
  about: '',
  habitat: '',
  uses: '',
};

const FIG: PublicSpecies = {
  slug: 'ficus-benjamina',
  scientificName: 'Ficus benjamina',
  authority: '',
  family: '',
  commonNames: [],
  iucnCode: 'NE',
  sarawakProtected: false,
  summary: '',
  about: '',
  habitat: '',
  uses: '',
};

const SPECIES = [PITCHER, FIG];

function plant(changes: Partial<PublicRecord> = {}): PublicRecord {
  return {
    id: 'e1a2b3c4-5d6e-4f70-8a9b-0c1d2e3f4a51',
    tagCode: 'NNP-E1A2B3',
    speciesName: 'Nepenthes rafflesiana',
    recordedAt: '2026-10-20T02:30:00.000Z',
    ...changes,
  };
}

describe('speciesOf', () => {
  it('finds the species the plant was matched to', () => {
    expect(speciesOf(plant({ speciesSlug: 'nepenthes-rafflesiana' }), SPECIES)).toBe(PITCHER);
    expect(speciesOf(plant({ speciesSlug: 'ficus-benjamina' }), SPECIES)).toBe(FIG);
  });

  it('gives nothing when the plant was never matched to a species', () => {
    expect(speciesOf(plant(), SPECIES)).toBeUndefined();
  });

  it('gives nothing when the species is missing from the saved list', () => {
    expect(speciesOf(plant({ speciesSlug: 'shorea-macrophylla' }), SPECIES)).toBeUndefined();
    expect(speciesOf(plant({ speciesSlug: 'nepenthes-rafflesiana' }), [])).toBeUndefined();
  });
});

describe('plantName', () => {
  it("uses the species' first common name, even when the plant has its own", () => {
    expect(plantName(plant({ commonName: 'Pitcher plant' }), PITCHER)).toBe(
      'Raffles pitcher plant',
    );
  });

  it('uses the common name the field team wrote when the species has none', () => {
    expect(plantName(plant({ commonName: 'Weeping fig' }), FIG)).toBe('Weeping fig');
    expect(plantName(plant({ commonName: 'Weeping fig' }))).toBe('Weeping fig');
  });

  it('uses the Latin name the field team wrote when nothing has a common name', () => {
    expect(plantName(plant({ speciesName: 'Ficus benjamina' }), FIG)).toBe('Ficus benjamina');
    expect(plantName(plant({ speciesName: 'Ficus sp.' }))).toBe('Ficus sp.');
  });
});

describe('hasCommonName', () => {
  it('says yes when the species or the plant has a common name', () => {
    expect(hasCommonName(plant(), PITCHER)).toBe(true);
    expect(hasCommonName(plant({ commonName: 'Weeping fig' }), FIG)).toBe(true);
    expect(hasCommonName(plant({ commonName: 'Weeping fig' }))).toBe(true);
  });

  it('says no when the plant only goes by its Latin name', () => {
    expect(hasCommonName(plant(), FIG)).toBe(false);
    expect(hasCommonName(plant())).toBe(false);
  });
});

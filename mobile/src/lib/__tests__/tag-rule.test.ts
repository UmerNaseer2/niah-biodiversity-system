import { codeOnlyReason } from '@/lib/tag-rule';
import type { PublicSpecies } from '@/types/public-copy';

const shorea: PublicSpecies = {
  slug: 'shorea-macrophylla',
  scientificName: 'Shorea macrophylla',
  authority: '',
  family: 'Dipterocarpaceae',
  commonNames: ['Engkabang jantong'],
  iucnCode: 'LC',
  sarawakProtected: false,
  roughAreaOnly: false,
  summary: '',
  about: '',
  habitat: '',
  uses: '',
};

const record = { speciesName: 'Shorea macrophylla', speciesSlug: 'shorea-macrophylla' };

describe('codeOnlyReason', () => {
  it("lets a common species' tag hold a link, like the exact spot on the public map", () => {
    expect(codeOnlyReason(record, [shorea])).toBeNull();
    expect(codeOnlyReason(record, [{ ...shorea, iucnCode: 'NT' }])).toBeNull();
    // Capitals and extra spaces don't count, the same as on the server
    expect(codeOnlyReason({ ...record, speciesName: ' shorea  MACROPHYLLA ' }, [shorea])).toBeNull();
  });

  it('gives the same reason line as the website for a protected species', () => {
    expect(codeOnlyReason(record, [{ ...shorea, sarawakProtected: true }])).toBe(
      'This species is protected, so its tag holds only the code. Staff can scan it in the Niah app.',
    );
    // Protected comes first when it's threatened as well
    expect(
      codeOnlyReason(record, [{ ...shorea, sarawakProtected: true, iucnCode: 'CR' }]),
    ).toMatch(/^This species is protected/);
  });

  it.each(['VU', 'EN', 'CR'] as const)('says a %s species is threatened', (iucnCode) => {
    expect(codeOnlyReason(record, [{ ...shorea, iucnCode }])).toMatch(
      /^This species is threatened, so its tag holds only the code\./,
    );
  });

  it.each(['DD', 'NE'] as const)('lets a %s species hold a link, since nobody has said it is at risk', (iucnCode) => {
    expect(codeOnlyReason(record, [{ ...shorea, iucnCode }])).toBeNull();
    // An officer can still keep it to a rough area
    expect(codeOnlyReason(record, [{ ...shorea, iucnCode, roughAreaOnly: true }])).toMatch(
      /rough area/,
    );
  });

  it('keeps a rough area species, or one saved before the phone knew, to the code', () => {
    expect(codeOnlyReason(record, [{ ...shorea, roughAreaOnly: true }])).toMatch(/rough area/);
    const { roughAreaOnly: _unknown, ...older } = shorea;
    expect(codeOnlyReason(record, [older])).toMatch(/rough area/);
  });

  it('keeps a plant with no species, a missing species or a different name to the code', () => {
    expect(codeOnlyReason({ speciesName: 'Ficus sp.' }, [shorea])).toMatch(
      /isn't matched to a species yet/,
    );
    expect(codeOnlyReason(record, [])).toMatch(/doesn't have the plant info/);
    expect(codeOnlyReason({ ...record, speciesName: 'Shorea curtisii' }, [shorea])).toMatch(
      /name doesn't match its species/,
    );
  });

  it('always ends by saying staff can still scan it, with no long dashes', () => {
    for (const reason of [
      codeOnlyReason({ speciesName: 'x' }, []),
      codeOnlyReason(record, []),
      codeOnlyReason(record, [{ ...shorea, iucnCode: 'EN' }]),
    ]) {
      expect(reason).toMatch(/Staff can scan it in the Niah app\.$/);
      expect(reason).not.toMatch(/[–—\n]/);
    }
  });
});

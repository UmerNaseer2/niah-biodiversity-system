import { MOCK_RECORDS } from '@/data/mock-records';
import { SPECIES_LIST } from '@/data/species-list';
import { parseHeight } from '@/lib/height';
import { tagCodeFor } from '@/lib/id';

describe('MOCK_RECORDS', () => {
  it('has no repeated IDs or tag codes', () => {
    const ids = MOCK_RECORDS.map((record) => record.id);
    const tags = MOCK_RECORDS.map((record) => record.tagCode);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('gives every record the tag code its ID would get on a phone', () => {
    MOCK_RECORDS.forEach((record) => expect(record.tagCode).toBe(tagCodeFor(record.id)));
  });

  it('only uses heights the New Record form would accept', () => {
    MOCK_RECORDS.forEach((record) => {
      if (record.heightM !== undefined) {
        expect(parseHeight(String(record.heightM))).toEqual({
          valid: true,
          value: record.heightM,
        });
      }
    });
  });

  it('links every record to a species on the list, spelt the same way', () => {
    MOCK_RECORDS.forEach((record) => {
      const option = SPECIES_LIST.find((species) => species.slug === record.speciesSlug);
      expect(option?.scientificName).toBe(record.speciesName);
    });
  });

  it('has both pending and synced records so both tags show up on screen', () => {
    const statuses = new Set(MOCK_RECORDS.map((record) => record.syncStatus));
    expect(statuses).toEqual(new Set(['pending', 'synced']));
  });
});

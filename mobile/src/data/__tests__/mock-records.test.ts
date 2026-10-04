import { MOCK_RECORDS, mockGpsReading } from '@/data/mock-records';
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

  it('has both pending and synced records so both tags show up on screen', () => {
    const statuses = new Set(MOCK_RECORDS.map((record) => record.syncStatus));
    expect(statuses).toEqual(new Set(['pending', 'synced']));
  });
});

describe('mockGpsReading', () => {
  // The fake fixes are random points within about half a kilometre of the park HQ,
  // never real plant spots.
  it('stays close to the park HQ with a believable accuracy', () => {
    for (let i = 0; i < 200; i += 1) {
      const reading = mockGpsReading();
      expect(Math.abs(reading.latitude - 3.8141)).toBeLessThanOrEqual(0.005);
      expect(Math.abs(reading.longitude - 113.7787)).toBeLessThanOrEqual(0.005);
      expect(reading.accuracyM).toBeGreaterThanOrEqual(4);
      expect(reading.accuracyM).toBeLessThanOrEqual(35);
    }
  });
});

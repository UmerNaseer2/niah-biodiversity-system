import { firstRecordId, plantHistory } from '@/lib/visits';
import type { PlantRecord } from '@/types/plant-record';

function record(id: string, recordedAt: string, visitOf?: string): PlantRecord {
  return {
    id,
    tagCode: `NNP-${id.slice(0, 6).toUpperCase()}`,
    speciesName: 'Eusideroxylon zwageri',
    condition: 'healthy',
    photoCount: 0,
    recordedAt,
    syncStatus: 'pending',
    ...(visitOf ? { visitOf } : {}),
  };
}

const first = record('aaaaaa00-0000-4000-8000-000000000001', '2026-10-01T01:00:00.000Z');
const visitOne = record('bbbbbb00-0000-4000-8000-000000000002', '2026-10-08T01:00:00.000Z', first.id);
const visitTwo = record('cccccc00-0000-4000-8000-000000000003', '2026-10-15T01:00:00.000Z', first.id);
const otherPlant = record('dddddd00-0000-4000-8000-000000000004', '2026-10-20T01:00:00.000Z');
const otherVisit = record(
  'eeeeee00-0000-4000-8000-000000000005',
  '2026-10-21T01:00:00.000Z',
  otherPlant.id,
);
const all = [visitOne, otherVisit, first, visitTwo, otherPlant];

describe('firstRecordId', () => {
  it('is the record itself for a first record', () => {
    expect(firstRecordId(first)).toBe(first.id);
  });

  it('is the first record for a visit', () => {
    expect(firstRecordId(visitTwo)).toBe(first.id);
  });
});

describe('plantHistory', () => {
  it('has the first record and every visit to it, newest first', () => {
    expect(plantHistory(all, first)).toEqual([visitTwo, visitOne, first]);
  });

  it('is the same list from any visit to the plant', () => {
    expect(plantHistory(all, visitOne)).toEqual([visitTwo, visitOne, first]);
  });

  it("leaves out other plants and their visits", () => {
    expect(plantHistory(all, otherPlant)).toEqual([otherVisit, otherPlant]);
  });

  it('is only the record itself for a plant with no visits', () => {
    const alone = record('ffffff00-0000-4000-8000-000000000006', '2026-10-22T01:00:00.000Z');
    expect(plantHistory([...all, alone], alone)).toEqual([alone]);
  });

  it("still lists the visits when the first record isn't on this phone", () => {
    expect(plantHistory([visitOne, visitTwo], visitOne)).toEqual([visitTwo, visitOne]);
  });

  it('keeps two records saved at the same moment in the order they came in', () => {
    const sameTime = record(
      'abcdef00-0000-4000-8000-000000000007',
      visitTwo.recordedAt,
      first.id,
    );
    expect(plantHistory([visitTwo, sameTime, first], first)).toEqual([visitTwo, sameTime, first]);
  });

  it("doesn't change the list it's given", () => {
    const copy = [...all];
    plantHistory(all, first);
    expect(all).toEqual(copy);
  });
});

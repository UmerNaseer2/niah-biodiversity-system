import type { SupabaseClient } from '@supabase/supabase-js';
import * as Network from 'expo-network';

import { findPlantOnServer, plantFromRow, type FindPlantRow } from '@/sync/find-plant';

jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn() }));

// What supabase/029_find_plant_by_tag.sql sends back for a plant with two visits.
const ROW: FindPlantRow = {
  id: 'd00d0300-0000-4000-8000-000000000003',
  tag_code: 'NNP-D00D03',
  species_name: 'Nepenthes rafflesiana',
  common_name: 'Raffles pitcher plant',
  species_slug: 'nepenthes-rafflesiana',
  condition: 'healthy',
  recorded_at: '2026-10-20T02:30:00+00:00',
  status: 'waiting',
  visit_count: 2,
  last_visit_at: '2026-11-10T02:00:00+00:00',
  last_visit_condition: 'damaged',
};

type Answer = {
  data: unknown;
  error: { message: string; code: string } | null;
  status: number;
};

/** A fake Supabase client that writes down each rpc() call and gives back this answer. */
function fakeServer(answer: Answer | Error) {
  const calls: [string, unknown][] = [];
  const supabase = {
    rpc(name: string, args: unknown) {
      calls.push([name, args]);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, calls };
}

function online(isConnected: boolean | null = true) {
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValue({ isConnected } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  online();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.mocked(console.warn).mockRestore();
});

describe('plantFromRow', () => {
  it('turns a row from the server into a plant', () => {
    expect(plantFromRow(ROW)).toEqual({
      id: ROW.id,
      tagCode: 'NNP-D00D03',
      speciesName: 'Nepenthes rafflesiana',
      commonName: 'Raffles pitcher plant',
      speciesSlug: 'nepenthes-rafflesiana',
      condition: 'healthy',
      recordedAt: ROW.recorded_at,
      reviewStatus: 'waiting',
      visitCount: 2,
      lastVisitAt: ROW.last_visit_at,
      lastVisitCondition: 'damaged',
    });
  });

  it('leaves out what the plant has no value for', () => {
    const plant = plantFromRow({
      ...ROW,
      common_name: null,
      species_slug: '',
      condition: null,
      visit_count: 0,
      last_visit_at: null,
      last_visit_condition: null,
    });
    expect(plant).toEqual({
      id: ROW.id,
      tagCode: 'NNP-D00D03',
      speciesName: 'Nepenthes rafflesiana',
      recordedAt: ROW.recorded_at,
      reviewStatus: 'waiting',
      visitCount: 0,
    });
  });

  it("leaves out a condition the phone doesn't know, and a visit count that isn't one", () => {
    const plant = plantFromRow({
      ...ROW,
      condition: 'wilting',
      last_visit_condition: 'gone',
      visit_count: -1,
    });
    expect(plant?.condition).toBeUndefined();
    expect(plant?.lastVisitCondition).toBeUndefined();
    expect(plant?.visitCount).toBe(0);
    expect(plantFromRow({ ...ROW, visit_count: 'lots' })?.visitCount).toBe(0);
  });

  it("gives nothing for a row that's missing what the screen needs", () => {
    expect(plantFromRow(null)).toBeUndefined();
    expect(plantFromRow('NNP-D00D03')).toBeUndefined();
    for (const key of ['id', 'tag_code', 'species_name', 'recorded_at'] as const) {
      expect(plantFromRow({ ...ROW, [key]: null })).toBeUndefined();
      expect(plantFromRow({ ...ROW, [key]: ' ' })).toBeUndefined();
    }
    expect(plantFromRow({ ...ROW, status: 'archived' })).toBeUndefined();
  });
});

describe('findPlantOnServer', () => {
  it('asks the server for the tag and gives back the plant', async () => {
    const { supabase, calls } = fakeServer({ data: [ROW], error: null, status: 200 });
    const result = await findPlantOnServer(supabase, 'NNP-D00D03');
    expect(calls).toEqual([['find_plant_by_tag', { code: 'NNP-D00D03' }]]);
    expect(result).toEqual({ kind: 'found', plant: plantFromRow(ROW) });
  });

  it('says so when no plant has the tag', async () => {
    const { supabase } = fakeServer({ data: [], error: null, status: 200 });
    expect(await findPlantOnServer(supabase, 'NNP-000000')).toEqual({ kind: 'none' });
  });

  it("doesn't ask when the phone knows it has no signal", async () => {
    online(false);
    const { supabase, calls } = fakeServer({ data: [ROW], error: null, status: 200 });
    expect(await findPlantOnServer(supabase, 'NNP-D00D03')).toEqual({ kind: 'offline' });
    expect(calls).toEqual([]);
  });

  it("still asks when the phone isn't sure about the signal", async () => {
    online(null);
    const { supabase, calls } = fakeServer({ data: [ROW], error: null, status: 200 });
    expect((await findPlantOnServer(supabase, 'NNP-D00D03')).kind).toBe('found');
    expect(calls).toHaveLength(1);
  });

  it('counts no answer, or a request that runs out of time, as no signal', async () => {
    const noAnswer = fakeServer({
      data: null,
      error: { message: 'TypeError: Network request failed', code: '' },
      status: 0,
    });
    expect(await findPlantOnServer(noAnswer.supabase, 'NNP-D00D03')).toEqual({ kind: 'offline' });
    const timedOut = fakeServer(new Error('The request took too long'));
    expect(await findPlantOnServer(timedOut.supabase, 'NNP-D00D03')).toEqual({ kind: 'offline' });
  });

  it("says when the account isn't allowed to look up plants", async () => {
    const { supabase } = fakeServer({
      data: null,
      error: { message: 'Only field staff can look up a plant by its tag', code: '42501' },
      status: 403,
    });
    expect(await findPlantOnServer(supabase, 'NNP-D00D03')).toEqual({ kind: 'not-allowed' });
  });

  it("fails on any other error, like when the server doesn't have 029 yet", async () => {
    const { supabase } = fakeServer({
      data: null,
      error: { message: 'Could not find the function', code: 'PGRST202' },
      status: 404,
    });
    expect(await findPlantOnServer(supabase, 'NNP-D00D03')).toEqual({ kind: 'failed' });
    expect(console.warn).toHaveBeenCalled();
  });

  it("fails when the row from the server is missing something", async () => {
    const { supabase } = fakeServer({
      data: [{ ...ROW, species_name: null }],
      error: null,
      status: 200,
    });
    expect(await findPlantOnServer(supabase, 'NNP-D00D03')).toEqual({ kind: 'failed' });
  });
});

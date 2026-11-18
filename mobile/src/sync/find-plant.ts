// Field staff looking up a plant by its tag on the server, for when someone else recorded it. A
// botanist's phone only has the records they made and the approved plants in the plant info, so a
// plant another botanist recorded that's still waiting for review isn't on it anywhere.
// supabase/029_find_plant_by_tag.sql gives back only what's needed to add a visit to the plant:
// never where it is, the notes, the photos or who recorded it.
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Network from 'expo-network';

import {
  PLANT_CONDITIONS,
  REVIEW_STATUSES,
  type PlantCondition,
  type ReviewStatus,
} from '@/types/plant-record';

/** A plant's first record, as the server tells field staff about it. */
export type FoundPlant = {
  /** The first record's ID. A visit to the plant points at this. */
  id: string;
  tagCode: string;
  speciesName: string;
  commonName?: string;
  speciesSlug?: string;
  /** What the first record said, the first time someone saw the plant. */
  condition?: PlantCondition;
  recordedAt: string;
  reviewStatus: ReviewStatus;
  visitCount: number;
  lastVisitAt?: string;
  lastVisitCondition?: PlantCondition;
};

export type FindPlantResult =
  | { kind: 'found'; plant: FoundPlant }
  /** No record on the server has this tag. */
  | { kind: 'none' }
  /** No answer from the server, which is just no signal. */
  | { kind: 'offline' }
  /** The server says this account can't look up plants, like a visitor account. */
  | { kind: 'not-allowed' }
  /** Any other answer, like when the server is missing the SQL file. */
  | { kind: 'failed' };

/** One row of what the server sends back. */
export type FindPlantRow = {
  id: string;
  tag_code: string;
  species_name: string;
  common_name: string | null;
  species_slug: string | null;
  condition: string | null;
  recorded_at: string;
  status: string;
  visit_count: number;
  last_visit_at: string | null;
  last_visit_condition: string | null;
};

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function conditionFrom(value: unknown): PlantCondition | undefined {
  return (PLANT_CONDITIONS as readonly unknown[]).includes(value)
    ? (value as PlantCondition)
    : undefined;
}

/**
 * Turns a row from the server into a FoundPlant, or undefined if it's missing something the
 * screen needs. A value the phone doesn't know, like a new condition, is left out instead.
 */
export function plantFromRow(row: unknown): FoundPlant | undefined {
  if (typeof row !== 'object' || row === null) {
    return undefined;
  }
  const value = row as Partial<Record<keyof FindPlantRow, unknown>>;
  if (
    !isText(value.id) ||
    !isText(value.tag_code) ||
    !isText(value.species_name) ||
    !isText(value.recorded_at) ||
    !(REVIEW_STATUSES as readonly unknown[]).includes(value.status)
  ) {
    return undefined;
  }
  const visits = Number(value.visit_count);
  return {
    id: value.id,
    tagCode: value.tag_code,
    speciesName: value.species_name,
    commonName: isText(value.common_name) ? value.common_name : undefined,
    speciesSlug: isText(value.species_slug) ? value.species_slug : undefined,
    condition: conditionFrom(value.condition),
    recordedAt: value.recorded_at,
    reviewStatus: value.status as ReviewStatus,
    visitCount: Number.isInteger(visits) && visits > 0 ? visits : 0,
    lastVisitAt: isText(value.last_visit_at) ? value.last_visit_at : undefined,
    lastVisitCondition: conditionFrom(value.last_visit_condition),
  };
}

/** Asks the server for the plant with this tag code, like NNP-3F2A9C. */
export async function findPlantOnServer(
  supabase: SupabaseClient,
  tagCode: string,
): Promise<FindPlantResult> {
  // Only a phone that knows it has no signal counts as offline. If it isn't sure, it tries.
  const network = await Network.getNetworkStateAsync();
  if (network.isConnected === false) {
    return { kind: 'offline' };
  }
  let answer;
  try {
    answer = await supabase.rpc('find_plant_by_tag', { code: tagCode });
  } catch {
    // The time limit on every request ends one that hangs by throwing.
    return { kind: 'offline' };
  }
  const { data, error, status } = answer;
  if (error) {
    if (status === 0) {
      return { kind: 'offline' };
    }
    if (error.code === '42501') {
      return { kind: 'not-allowed' };
    }
    // An answer with an error won't fix itself, like when 029 hasn't been run on the server.
    console.warn("Couldn't look up the plant.", error);
    return { kind: 'failed' };
  }
  const rows: unknown[] = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    return { kind: 'none' };
  }
  const plant = plantFromRow(rows[0]);
  if (!plant) {
    console.warn("The server's answer about the plant was missing something.", rows[0]);
    return { kind: 'failed' };
  }
  return { kind: 'found', plant };
}

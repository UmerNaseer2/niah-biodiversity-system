// The rules for sending a record to Supabase and reading what comes back. Nothing in here talks to
// the server yet: item 10 adds the "Sync now" button and the Supabase client that use these.
// docs/sync-design.md explains the whole plan, and supabase/005_phone_sync.sql is the server side.
import type { PlantRecord } from '@/types/plant-record';

/**
 * One record the way the records table on Supabase takes it. Every column is there, with null for
 * an empty one. tag_code isn't sent, because the server works it out from the ID, and neither are
 * the status, recorded_by or the review columns, because only the server fills those in.
 */
export type UploadRow = {
  id: string;
  species_name: string;
  species_slug: string | null;
  common_name: string | null;
  height_m: number | null;
  condition: PlantRecord['condition'];
  notes: string | null;
  gps: { lat: number; lng: number; accuracyM: number; capturedAt: string } | null;
  photo_count: number;
  recorded_at: string;
};

export function toUploadRow(record: PlantRecord): UploadRow {
  const { location } = record;
  return {
    id: record.id,
    species_name: record.speciesName,
    species_slug: record.speciesSlug ?? null,
    common_name: record.commonName ?? null,
    height_m: record.heightM ?? null,
    condition: record.condition,
    notes: record.notes ?? null,
    gps: location
      ? {
          lat: location.latitude,
          lng: location.longitude,
          accuracyM: location.accuracyM,
          capturedAt: location.capturedAt,
        }
      : null,
    photo_count: record.photoCount,
    recorded_at: record.recordedAt,
  };
}

/** The parts of an error from the Supabase API that say what went wrong. */
export type UploadError = { code?: string; message?: string };

/** Why a record can't go up. Trying again won't fix any of these, so someone has to step in. */
export type UploadProblem =
  /** A different record on the server already has this tag code. */
  | 'tag-clash'
  /** This account isn't allowed to upload records. Nothing is wrong with the record itself. */
  | 'not-allowed'
  /** The server turned the record down because a value broke one of its rules. */
  | 'rejected';

export type UploadOutcome =
  /** The record is on the server now, or it already was from an earlier try. */
  | { kind: 'synced' }
  /** It didn't get through this time (no signal, the server is down, and so on). Try later. */
  | { kind: 'retry' }
  | { kind: 'problem'; problem: UploadProblem };

/**
 * Works out what happened to an upload from the error the Supabase API sent back, or null if it
 * worked. The codes come from Postgres (supabase/tests/sync.test.js checks the server sends them).
 */
export function classifyUpload(error: UploadError | null): UploadOutcome {
  if (!error) {
    return { kind: 'synced' };
  }
  const code = error.code ?? '';
  const message = error.message ?? '';
  // 23505 means a unique rule stopped the record going in twice.
  if (code === '23505') {
    // Same ID, so this record went up before but the phone never heard back.
    if (message.includes('"records_pkey"')) {
      return { kind: 'synced' };
    }
    if (message.includes('"records_tag_code_key"')) {
      return { kind: 'problem', problem: 'tag-clash' };
    }
    return { kind: 'problem', problem: 'rejected' };
  }
  // 42501 is Postgres saying no: the account doesn't have the role, or isn't signed in.
  if (code === '42501') {
    return { kind: 'problem', problem: 'not-allowed' };
  }
  // 22 is a value the column can't take and 23 is a value that breaks a rule on the table.
  if (/^2[23]/.test(code)) {
    return { kind: 'problem', problem: 'rejected' };
  }
  // No signal, a server error, or the server being behind the app. None of these are the
  // record's fault, so it stays waiting and goes up on a later sync.
  return { kind: 'retry' };
}

/** What to tell the person syncing when a record can't go up. */
export function uploadProblemMessage(problem: UploadProblem) {
  switch (problem) {
    case 'tag-clash':
      return (
        'Another record on the server has the same tag code. Ask an officer to sort it out ' +
        "before you print this plant's tag."
      );
    case 'not-allowed':
      return (
        "Your account can't upload records yet. Ask an admin to give you the botanist role, then " +
        'sync again.'
      );
    case 'rejected':
      return (
        "The server turned this record down. It's still on this phone, so ask an officer to " +
        'check it.'
      );
  }
}

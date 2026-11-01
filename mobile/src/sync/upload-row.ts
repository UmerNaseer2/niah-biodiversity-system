// The rules for sending a record to Supabase and reading what comes back. Nothing in here talks to
// the server: src/sync/sync-engine.ts does that with these. docs/sync-design.md explains the whole
// plan, and supabase/005_phone_sync.sql is the server side.
import type { PlantRecord, UploadProblem } from '@/types/plant-record';

// The phone keeps the problem with the record (src/db), so the type lives with the record types.
export type { UploadProblem } from '@/types/plant-record';

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
  gps: {
    lat: number;
    lng: number;
    accuracyM: number;
    capturedAt: string;
  } | null;
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
    // An officer deleted this record on the website, and the server keeps the ID so it doesn't
    // come back (supabase/010_deleted_records.sql).
    if (message.includes('"deleted_records_pkey"')) {
      return { kind: 'problem', problem: 'deleted' };
    }
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

/**
 * Whether the request never got an answer. supabase-js gives status 0 and no code when fetch fails,
 * and then the rest of the records won't get through either.
 */
export function isNoSignal(error: UploadError | null, status: number) {
  return Boolean(error) && (status === 0 || !error?.code);
}

/**
 * Whether the server said the login token isn't any good. PGRST301 and PGRST303 are the API
 * (PostgREST) saying so. That's about the session and not the record, so the record stays as it is.
 */
export function isSessionRefused(error: UploadError | null) {
  return error?.code?.startsWith('PGRST30') ?? false;
}

/** What to tell the person syncing when a record can't go up. */
export function uploadProblemMessage(problem: UploadProblem) {
  switch (problem) {
    case 'tag-clash':
      return (
        'Another record on the server already has this tag code, so this one needs a new tag. If ' +
        'you already put a tag on the plant, it has to be swapped for the new one.'
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
    case 'deleted':
      return (
        "An officer deleted this record on the website, so the server won't take it again. It's " +
        'still on this phone. Ask an officer if you think it should be put back, or remove it ' +
        'from this phone if not.'
      );
  }
}

/** The storage-js error fields that say what happened. It has no status when fetch itself failed. */
export type PhotoUploadError = { status?: number; statusCode?: string; code?: string };

/** What came of sending one photo. */
export type PhotoUploadAnswer =
  'uploaded' | 'missing' | 'rejected' | 'offline' | 'signed-out' | 'not-allowed' | 'retry';

// Supabase Storage says the same thing in more than one way depending on where it was refused, and
// can send a 400 with the real number in the body, so these look at all three fields.
const PHOTO_ALREADY_THERE = ['409', 'Duplicate', 'ResourceAlreadyExists', 'KeyAlreadyExists'];
const PHOTO_SIGNED_OUT = ['401', 'InvalidJWT', 'ExpiredToken'];
const PHOTO_NOT_ALLOWED = ['403', 'Unauthorized', 'AccessDenied'];
const PHOTO_TURNED_DOWN = [
  '413',
  'EntityTooLarge',
  'Payload too large',
  '415',
  'InvalidMimeType',
  'invalid_mime_type',
];

/**
 * Sorts out what the server said about a photo. The file on the server can't be replaced, so "it's
 * already there" means an earlier try got through and only the answer was lost. Anything this
 * doesn't know about goes again next time, because trying again can't do any harm.
 */
export function classifyPhotoUpload(error: PhotoUploadError | null): PhotoUploadAnswer {
  if (!error) {
    return 'uploaded';
  }
  if (error.status === undefined && error.statusCode === undefined) {
    return 'offline';
  }
  const said = [String(error.status), error.statusCode, error.code];
  const saidAny = (answers: string[]) => said.some((one) => one && answers.includes(one));
  if (saidAny(PHOTO_ALREADY_THERE)) {
    return 'uploaded';
  }
  if (saidAny(PHOTO_SIGNED_OUT)) {
    return 'signed-out';
  }
  if (saidAny(PHOTO_NOT_ALLOWED)) {
    return 'not-allowed';
  }
  return saidAny(PHOTO_TURNED_DOWN) ? 'rejected' : 'retry';
}

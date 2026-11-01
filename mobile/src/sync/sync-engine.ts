// One sync, start to finish: upload what's waiting, read back what officers decided, download the
// species list. docs/sync-design.md explains the rules. This file doesn't know about Supabase or
// React, so every path through it can be tested with a fake server (src/sync/supabase-api.ts is
// the real one, and src/state/sync-context.tsx decides when to run it).
import type { SpeciesOption } from '@/data/species-list';
import type { RecordReview, RecordsStore } from '@/db/records-store';
import { plural } from '@/lib/format';
import { REVIEW_STATUSES, type ReviewStatus } from '@/types/plant-record';

import {
  classifyUpload,
  isNoSignal,
  isSessionRefused,
  toUploadRow,
  type UploadError,
  type UploadRow,
} from './upload-row';

/**
 * Whether a request now would go out as the signed in person. It's checked before every upload,
 * because with no session supabase-js quietly sends the request with the anon key. The server would
 * turn that down as "not allowed", and the record would wrongly get blamed.
 */
export type SessionCheck = 'ok' | 'offline' | 'signed-out';

export type SyncApi = {
  session: () => Promise<SessionCheck>;
  insertRecord: (row: UploadRow) => Promise<{ error: UploadError | null; status: number }>;
  /** What officers decided about these records, or null if the server couldn't be read. */
  fetchReviews: (ids: string[]) => Promise<RecordReview[] | null>;
  /** The whole species list, or null if the server couldn't be read. */
  fetchSpecies: () => Promise<SpeciesOption[] | null>;
};

export type SyncStore = Pick<
  RecordsStore,
  | 'loadWaiting'
  | 'saveUploadOutcome'
  | 'loadSyncedIds'
  | 'saveReviews'
  | 'replaceSpecies'
  | 'saveLastSynced'
>;

export type SyncOutcome = 'done' | 'offline' | 'signed-out' | 'not-allowed' | 'error';

export type SyncResult = {
  outcome: SyncOutcome;
  uploaded: number;
  /** Records the server turned down, so they need someone to sort them out. */
  problems: number;
  /** Records that had a passing failure and go again next time. */
  retryLater: number;
  /** All the records went up, but the decisions or the species list couldn't be downloaded. */
  refreshFailed: boolean;
  finishedAt: string;
};

export type SyncOptions = {
  /**
   * Whether to try records that came back with a problem last time. Someone pressing Sync now may
   * have just sorted one out, so that tries everything. An automatic sync skips them, or each one
   * would send a request every minute forever. Not allowed is the exception: it's about the
   * account, it stops the sync at the first record, and it gets fixed by an admin far away.
   */
  retryProblems: boolean;
};

const REVIEWS_PER_REQUEST = 100;

export async function runSync(
  api: SyncApi,
  store: SyncStore,
  { retryProblems }: SyncOptions,
): Promise<SyncResult> {
  let uploaded = 0;
  let problems = 0;
  let retryLater = 0;
  let refreshFailed = false;

  function finish(outcome: SyncOutcome): SyncResult {
    return {
      outcome,
      uploaded,
      problems,
      retryLater,
      refreshFailed,
      finishedAt: new Date().toISOString(),
    };
  }

  try {
    const first = await api.session();
    if (first !== 'ok') {
      return finish(first);
    }

    for (const record of await store.loadWaiting()) {
      if (!retryProblems && record.uploadProblem && record.uploadProblem !== 'not-allowed') {
        problems++;
        continue;
      }
      const session = await api.session();
      if (session !== 'ok') {
        return finish(session);
      }
      const { error, status } = await api.insertRecord(toUploadRow(record));
      if (isNoSignal(error, status)) {
        return finish('offline');
      }
      if (isSessionRefused(error)) {
        return finish('signed-out');
      }
      const outcome = classifyUpload(error);
      await store.saveUploadOutcome(record.id, outcome);
      if (outcome.kind === 'synced') {
        uploaded++;
      } else if (outcome.kind === 'retry') {
        retryLater++;
      } else {
        problems++;
        if (outcome.problem === 'not-allowed') {
          // Every other record would get the same answer, so there's no use asking.
          return finish('not-allowed');
        }
      }
    }

    refreshFailed = !(await downloadReviews(api, store));
    if (!(await downloadSpecies(api, store))) {
      refreshFailed = true;
    }
    if (!refreshFailed) {
      await store.saveLastSynced(new Date().toISOString());
    }
    return finish('done');
  } catch (error) {
    // Only the phone can get here, since the server's failures come back as answers.
    console.warn("Couldn't finish syncing.", error);
    return finish('error');
  }
}

async function downloadReviews(api: SyncApi, store: SyncStore) {
  const ids = await store.loadSyncedIds();
  const reviews: RecordReview[] = [];
  for (let start = 0; start < ids.length; start += REVIEWS_PER_REQUEST) {
    const page = await api.fetchReviews(ids.slice(start, start + REVIEWS_PER_REQUEST));
    if (!page) {
      return false;
    }
    reviews.push(...page);
  }
  await store.saveReviews(reviews);
  return true;
}

async function downloadSpecies(api: SyncApi, store: SyncStore) {
  const list = await api.fetchSpecies();
  if (!list) {
    return false;
  }
  // An empty list only means something is wrong with the server, and the old list is still good.
  if (list.length === 0) {
    return true;
  }
  try {
    await store.replaceSpecies(list);
    return true;
  } catch (error) {
    console.warn("Couldn't save the species list.", error);
    return false;
  }
}

/** One row read back from the records table. */
export type ReviewRow = { id: string; status: string; review_notes: string | null };

/** The rows the phone understands. A status it doesn't know is left for a newer app. */
export function toReviews(rows: ReviewRow[]): RecordReview[] {
  return rows.flatMap((row) =>
    (REVIEW_STATUSES as readonly string[]).includes(row.status)
      ? [{ id: row.id, status: row.status as ReviewStatus, notes: row.review_notes }]
      : [],
  );
}

/** One row of the species_public view. */
export type SpeciesRow = {
  id: string;
  scientific_name: string | null;
  common_names: string[] | null;
};

/** The species the form can suggest. No common names is fine, no scientific name isn't. */
export function toSpeciesOptions(rows: SpeciesRow[]): SpeciesOption[] {
  return rows.flatMap((row) =>
    row.scientific_name?.trim()
      ? [{ slug: row.id, scientificName: row.scientific_name, commonNames: row.common_names ?? [] }]
      : [],
  );
}

const MAX_PAGES = 100;

/**
 * Reads a whole list a page at a time, stopping at an empty page and not a short one. The server
 * has its own limit on rows per request, so a short page can't be trusted to be the last one, and
 * stopping early would cut the list off with nothing to show for it. Null if a page failed.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[] | null>,
  pageSize = 500,
): Promise<T[] | null> {
  const all: T[] = [];
  for (let count = 0; count < MAX_PAGES; count++) {
    const page = await fetchPage(all.length, all.length + pageSize - 1);
    if (!page) {
      return null;
    }
    if (page.length === 0) {
      return all;
    }
    all.push(...page);
  }
  return null;
}

/** What to tell someone when a sync finishes. */
export function syncResultMessage(result: SyncResult) {
  const uploaded = result.uploaded > 0 ? `${plural(result.uploaded, 'record')} uploaded. ` : '';
  switch (result.outcome) {
    case 'offline':
      return `${uploaded}Can't reach the server right now. Your records are safe on this phone and will go up once it can.`;
    case 'signed-out':
      return `${uploaded}You need to sign in again before records can upload. They're safe on this phone.`;
    case 'not-allowed':
      return `${uploaded}Your account can't upload records yet. Ask an admin for the botanist role, then sync again.`;
    case 'error':
      return `${uploaded}Something went wrong on this phone while syncing. Your records are still saved, so try again.`;
    case 'done': {
      const parts = uploaded ? [uploaded.trim()] : [];
      if (result.problems > 0) {
        parts.push(
          `${plural(result.problems, 'record')} couldn't upload. Open ${result.problems === 1 ? 'it' : 'them'} to see why.`,
        );
      }
      if (result.retryLater > 0) {
        parts.push(`${plural(result.retryLater, 'record')} will try again next time.`);
      }
      if (result.refreshFailed) {
        parts.push("Couldn't download officers' decisions or the species list this time.");
      }
      return parts.join(' ') || 'Nothing new to upload.';
    }
  }
}

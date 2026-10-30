import type { SpeciesOption } from '@/data/species-list';
import type { UploadOutcome } from '@/sync/upload-row';
import type { PlantRecord, UploadProblem } from '@/types/plant-record';

import { BUSY_TIMEOUT_MS, openDatabase } from './database';

/** The records saved on this phone, and the species list downloaded with them. */
export type RecordsStore = {
  /** Every saved record, newest first. */
  loadRecords: () => Promise<PlantRecord[]>;
  /** Saves a new record. Fails if a saved record already has the same ID or tag code. */
  saveRecord: (record: PlantRecord) => Promise<void>;
  /**
   * The records that still have to go up, oldest first so they reach the server in the order
   * they were made. Records with an upload problem are in here too, because someone may have
   * sorted it out since, and trying again only costs one request.
   */
  loadWaiting: () => Promise<PlantRecord[]>;
  /**
   * Remembers what happened when a record was sent. Fails if no saved record has that ID, so
   * nothing gets marked as synced by mistake.
   */
  saveUploadOutcome: (id: string, outcome: UploadOutcome) => Promise<void>;
  /** The species from the last download, in the same order. Empty if there hasn't been one. */
  loadSpecies: () => Promise<SpeciesOption[]>;
  /**
   * Swaps the saved species list for a new download in one go. If any species in it can't be
   * saved, nothing changes and the old list stays. Turns down an empty list.
   */
  replaceSpecies: (list: SpeciesOption[]) => Promise<void>;
  close: () => Promise<void>;
};

export const NO_SUCH_RECORD = 'No record with that ID is saved on this phone.';

// Row level security on Supabase hands back no rows instead of an error when the account can't
// read a table, so an empty download is much more likely to be that than every species being gone.
export const EMPTY_SPECIES_LIST =
  'The species list that came down was empty, so the old one stays.';

// How many times replacing the species list is tried when the database is busy, and how long it
// waits before the next try (this many milliseconds times the try it's on).
export const SPECIES_TRIES = 3;
const SPECIES_RETRY_WAIT_MS = 200;

/** SQLITE_BUSY. Both phones put SQLite's own message for it in the error. */
function isBusyError(error: unknown) {
  return error instanceof Error && /database is locked/i.test(error.message);
}

/** One row of plant_records the way SQLite hands it back, with null for an empty column. */
type RecordRow = {
  id: string;
  tag_code: string;
  species_name: string;
  species_slug: string | null;
  common_name: string | null;
  height_m: number | null;
  condition: PlantRecord['condition'];
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  captured_at: string | null;
  photo_count: number;
  recorded_at: string;
  sync_status: PlantRecord['syncStatus'];
  upload_problem: UploadProblem | null;
};

/** One row of species. The common names are a JSON array. */
type SpeciesRow = {
  slug: string;
  scientific_name: string;
  common_names: string;
};

function toRecord(row: RecordRow): PlantRecord {
  const { latitude, longitude, accuracy_m: accuracyM, captured_at: capturedAt } = row;
  return {
    id: row.id,
    tagCode: row.tag_code,
    speciesName: row.species_name,
    speciesSlug: row.species_slug ?? undefined,
    commonName: row.common_name ?? undefined,
    heightM: row.height_m ?? undefined,
    condition: row.condition,
    notes: row.notes ?? undefined,
    // The table only takes all four parts of a location or none of them.
    location:
      latitude !== null && longitude !== null && accuracyM !== null && capturedAt !== null
        ? { latitude, longitude, accuracyM, capturedAt }
        : undefined,
    photoCount: row.photo_count,
    recordedAt: row.recorded_at,
    syncStatus: row.sync_status,
    uploadProblem: row.upload_problem ?? undefined,
  };
}

function toSpecies(row: SpeciesRow): SpeciesOption {
  return {
    slug: row.slug,
    scientificName: row.scientific_name,
    commonNames: JSON.parse(row.common_names) as string[],
  };
}

export async function openRecordsStore(): Promise<RecordsStore> {
  const db = await openDatabase();

  return {
    async loadRecords() {
      // rowid keeps two records saved in the same millisecond in the order they were saved.
      const rows = await db.getAllAsync<RecordRow>(
        'SELECT * FROM plant_records ORDER BY recorded_at DESC, rowid DESC',
      );
      return rows.map(toRecord);
    },

    async saveRecord(record) {
      await db.runAsync(
        `INSERT INTO plant_records (
          id, tag_code, species_name, species_slug, common_name, height_m, condition, notes,
          latitude, longitude, accuracy_m, captured_at, photo_count, recorded_at, sync_status,
          upload_problem
        ) VALUES (
          $id, $tagCode, $speciesName, $speciesSlug, $commonName, $heightM, $condition, $notes,
          $latitude, $longitude, $accuracyM, $capturedAt, $photoCount, $recordedAt, $syncStatus,
          $uploadProblem
        )`,
        {
          $id: record.id,
          $tagCode: record.tagCode,
          $speciesName: record.speciesName,
          $speciesSlug: record.speciesSlug ?? null,
          $commonName: record.commonName ?? null,
          $heightM: record.heightM ?? null,
          $condition: record.condition,
          $notes: record.notes ?? null,
          $latitude: record.location?.latitude ?? null,
          $longitude: record.location?.longitude ?? null,
          $accuracyM: record.location?.accuracyM ?? null,
          $capturedAt: record.location?.capturedAt ?? null,
          $photoCount: record.photoCount,
          $recordedAt: record.recordedAt,
          $syncStatus: record.syncStatus,
          $uploadProblem: record.uploadProblem ?? null,
        },
      );
    },

    async loadWaiting() {
      const rows = await db.getAllAsync<RecordRow>(
        "SELECT * FROM plant_records WHERE sync_status = 'pending' ORDER BY recorded_at, rowid",
      );
      return rows.map(toRecord);
    },

    async saveUploadOutcome(id, outcome) {
      // Nothing changes when it should be tried again. A problem from an earlier try stays,
      // because no signal doesn't mean it's been sorted out.
      if (outcome.kind === 'retry') {
        return;
      }
      const { changes } =
        outcome.kind === 'synced'
          ? await db.runAsync(
              `UPDATE plant_records SET sync_status = 'synced', upload_problem = NULL
              WHERE id = $id`,
              { $id: id },
            )
          : await db.runAsync('UPDATE plant_records SET upload_problem = $problem WHERE id = $id', {
              $id: id,
              $problem: outcome.problem,
            });
      if (changes === 0) {
        throw new Error(NO_SUCH_RECORD);
      }
    },

    async loadSpecies() {
      // The rows go in the order the list came down, so rowid keeps that order.
      const rows = await db.getAllAsync<SpeciesRow>(
        'SELECT slug, scientific_name, common_names FROM species ORDER BY rowid',
      );
      return rows.map(toSpecies);
    },

    async replaceSpecies(list) {
      if (list.length === 0) {
        throw new Error(EMPTY_SPECIES_LIST);
      }
      // This runs on its own connection, so a record saved at the same time can't end up inside
      // the transaction and get undone with it if the list fails. The record waits instead (see
      // busy_timeout in database.ts).
      //
      // The Jest stand-in for expo-sqlite can't show any of this. Its second connection is the
      // same sql.js database as the first and shares its transactions, so a test never sees two
      // connections fight over the write lock or one of them wait. Only a real phone can.
      const replace = () =>
        db.withExclusiveTransactionAsync(async (txn) => {
          // expo-sqlite opens a new connection for this every time, and a new connection doesn't
          // wait at all when the database is busy, so a record being saved would fail the list
          // straight away. Setting the wait here is still in time, because expo-sqlite starts the
          // transaction with a plain BEGIN, which doesn't lock anything until the DELETE.
          await txn.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
          await txn.runAsync('DELETE FROM species');
          for (const option of list) {
            await txn.runAsync(
              `INSERT INTO species (slug, scientific_name, common_names)
              VALUES ($slug, $scientificName, $commonNames)`,
              {
                $slug: option.slug,
                $scientificName: option.scientificName,
                $commonNames: JSON.stringify(option.commonNames),
              },
            );
          }
        });

      // If SQLite still says busy, like when a save takes longer than the wait above, the whole
      // transaction was rolled back, so it's safe to try it again from the start. Any other error
      // is a problem with the list itself and trying again won't help.
      for (let tryNumber = 1; ; tryNumber++) {
        try {
          await replace();
          return;
        } catch (error) {
          if (tryNumber >= SPECIES_TRIES || !isBusyError(error)) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, SPECIES_RETRY_WAIT_MS * tryNumber));
        }
      }
    },

    close() {
      return db.closeAsync();
    },
  };
}

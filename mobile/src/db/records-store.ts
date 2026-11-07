import type { SQLiteDatabase } from 'expo-sqlite';

import type { SpeciesOption } from '@/data/species-list';
import type { UploadOutcome } from '@/sync/upload-row';
import { isAppMode, type AppMode } from '@/types/app-mode';
import type {
  PhotoOutcome,
  PhotoProblem,
  PlantCondition,
  PlantRecord,
  RecordPhoto,
  ReviewStatus,
  UploadProblem,
} from '@/types/plant-record';
import type {
  IucnCode,
  NewPublicPhoto,
  PublicCopy,
  PublicPhoto,
  PublicRecord,
  PublicSpecies,
  ScanEntry,
} from '@/types/public-copy';

import { BUSY_TIMEOUT_MS, openDatabase } from './database';
import { unlockConnection } from './encryption';
import { keptPhotos } from './kept-photos';

/** What an officer decided about one record, read back from the server. */
export type RecordReview = {
  id: string;
  status: ReviewStatus;
  notes: string | null;
};

/**
 * The records saved on this phone and the species list downloaded with them, plus the copy of the
 * public plant info and the tags scanned on this phone.
 */
export type RecordsStore = {
  /** Every saved record, newest first. */
  loadRecords: () => Promise<PlantRecord[]>;
  /**
   * Saves a new record with its photos, all or nothing. photoPaths are the saved files in the order
   * they were taken. Fails if a saved record already has the same ID or tag code.
   */
  saveRecord: (record: PlantRecord, photoPaths?: string[]) => Promise<void>;
  /**
   * The records that still have to go up, oldest first so they reach the server in the order
   * they were made. Records with an upload problem are in here too, because someone may have
   * sorted it out since, and trying again only costs one request.
   */
  loadWaiting: () => Promise<PlantRecord[]>;
  /**
   * Remembers what happened when a record was sent. If no saved record has that ID it does
   * nothing, because the record was removed from the phone while it was on its way and there's
   * nothing left to mark. uploadedBy is the account that sent it, kept with a synced record so its
   * photos go to the folder the website looks in.
   */
  saveUploadOutcome: (id: string, outcome: UploadOutcome, uploadedBy?: string) => Promise<void>;
  /**
   * Takes a record and its photo rows off the phone once the server has said an officer deleted
   * it, so it won't take it again. Fails for any other record, so nothing that still has to go up
   * is lost.
   */
  removeDeleted: (id: string) => Promise<void>;
  /** The IDs of the records that are on the server, so the phone can ask what became of them. */
  loadSyncedIds: () => Promise<string[]>;
  /** Saves what officers decided, all or nothing. IDs not on this phone are ignored. */
  saveReviews: (reviews: RecordReview[]) => Promise<void>;
  /**
   * Gives a record whose tag code was already taken on the server a new ID and tag code, so it can
   * go up, and its photos move with it. Fails for any other record, because the ID of a record on
   * the server can't change.
   */
  renewTag: (id: string, newId: string, newTagCode: string) => Promise<void>;
  /** Every photo on this phone, in order within each record. */
  loadPhotos: () => Promise<RecordPhoto[]>;
  /**
   * The photos that still have to go up and that this account can send, oldest record first. A
   * record has to be on the server first, and only the account that sent it can send its photos.
   * Photos with a problem are in here too, for the same reason as in loadWaiting.
   */
  loadPhotosToUpload: (accountId: string) => Promise<RecordPhoto[]>;
  /** Remembers what happened when a photo was sent. An unknown photo does nothing. */
  savePhotoOutcome: (recordId: string, position: number, outcome: PhotoOutcome) => Promise<void>;
  /** When the phone last finished a whole sync (ISO 8601), or null if it never has. */
  loadLastSynced: () => Promise<string | null>;
  saveLastSynced: (finishedAt: string) => Promise<void>;
  /** The species from the last download, in the same order. Empty if there hasn't been one. */
  loadSpecies: () => Promise<SpeciesOption[]>;
  /**
   * Swaps the saved species list for a new download in one go. If any species in it can't be
   * saved, nothing changes and the old list stays. Turns down an empty list.
   */
  replaceSpecies: (list: SpeciesOption[]) => Promise<void>;
  /**
   * The public plant info from the last download, in the order it came down, and when it came
   * down. Empty with no time if there hasn't been one. It only reads, so it can run while the app
   * opens.
   */
  loadPublicCopy: () => Promise<PublicCopy>;
  /**
   * Swaps the saved public plant info for a new download in one go, together with when it came
   * down. If any species or record in it can't be saved, nothing changes and the old copy stays.
   * Turns down a download with no species.
   *
   * The photos are the main photo of each species. A photo whose link is the same as before keeps
   * the copy already on the phone. With no photos, like when they couldn't be downloaded, the
   * saved ones stay for the species still in the plant info.
   */
  replacePublicCopy: (
    species: PublicSpecies[],
    records: PublicRecord[],
    downloadedAt: string,
    photos?: NewPublicPhoto[] | null,
  ) => Promise<void>;
  /** The main photo of each species in the saved plant info, in the order they came down. */
  loadPublicPhotos: () => Promise<PublicPhoto[]>;
  /**
   * Notes the name of the copy of a photo saved on the phone. Says false and changes nothing when
   * the photo isn't saved with that link any more or already has a copy, like when new plant info
   * came down while it was downloading.
   */
  savePublicPhotoFile: (speciesSlug: string, url: string, file: string) => Promise<boolean>;
  /** The tags scanned on this phone, the latest scan first. */
  loadScans: () => Promise<ScanEntry[]>;
  /** Saves a scan. A tag scanned again moves up to the top instead of being listed twice. */
  saveScan: (tagCode: string, scannedAt: string) => Promise<void>;
  /** Forgets every scan on this phone. */
  clearScans: () => Promise<void>;
  /**
   * Whether this phone is used by a visitor or by park staff, or null if nobody has picked yet.
   * Anything else saved there also counts as not picked, so the app asks again.
   */
  loadMode: () => Promise<AppMode | null>;
  saveMode: (mode: AppMode) => Promise<void>;
  close: () => Promise<void>;
};

export const NOT_DELETED = 'Only a record an officer deleted on the website can be removed.';
export const NOT_TAG_CLASH = 'Only a record whose tag code was taken can get a new one.';

// Row level security on Supabase hands back no rows instead of an error when the account can't
// read a table, so an empty download is much more likely to be that than every species being gone.
export const EMPTY_SPECIES_LIST =
  'The species list that came down was empty, so the old one stays.';

// The same goes for the public plant info. A download with no records is fine, though, because the
// park might not have published any yet.
export const EMPTY_PUBLIC_COPY =
  'The plant info that came down had no species, so the old copy stays.';

// How many times a transaction on its own connection is tried when the database is busy, and how
// long it waits before the next try (this many milliseconds times the try it's on).
export const BUSY_TRIES = 3;
const BUSY_RETRY_WAIT_MS = 200;

/** SQLITE_BUSY. Both phones put SQLite's own message for it in the error. */
function isBusyError(error: unknown) {
  return error instanceof Error && /database is locked/i.test(error.message);
}

/**
 * Runs the task as one transaction on its own connection, so a record saved at the same time can't
 * end up inside the transaction and get undone with it if the task fails. The record waits instead
 * (see busy_timeout in database.ts).
 *
 * The Jest stand-in for expo-sqlite can't show any of this. Its second connection is the same
 * sql.js database as the first and shares its transactions, so a test never sees two connections
 * fight over the write lock or one of them wait. Only a real phone can.
 */
async function inOwnTransaction(db: SQLiteDatabase, task: (txn: SQLiteDatabase) => Promise<void>) {
  const attempt = () =>
    db.withExclusiveTransactionAsync(async (txn) => {
      // expo-sqlite opens a new connection for this every time, and a new connection doesn't have
      // the key and doesn't wait at all when the database is busy, so a record being saved would
      // fail the task straight away. Setting both here is still in time, because expo-sqlite starts
      // the transaction with a plain BEGIN, which doesn't touch the file until the first read.
      await unlockConnection(txn);
      await txn.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
      await task(txn);
    });

  // If SQLite still says busy, like when a save takes longer than the wait above, the whole
  // transaction was rolled back, so it's safe to try it again from the start. Any other error is a
  // problem with the task itself and trying again won't help.
  for (let tryNumber = 1; ; tryNumber++) {
    try {
      await attempt();
      return;
    } catch (error) {
      if (tryNumber >= BUSY_TRIES || !isBusyError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_WAIT_MS * tryNumber));
    }
  }
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
  review_status: ReviewStatus | null;
  review_notes: string | null;
  uploaded_by: string | null;
};

/** One row of record_photos. */
type PhotoRow = {
  record_id: string;
  position: number;
  path: string;
  uploaded_at: string | null;
  upload_problem: PhotoProblem | null;
};

/** One row of species. The common names are a JSON array. */
type SpeciesRow = {
  slug: string;
  scientific_name: string;
  common_names: string;
};

/** One row of public_species. The common names are a JSON array, and protected is 0 or 1. */
type PublicSpeciesRow = {
  slug: string;
  scientific_name: string;
  authority: string;
  family: string;
  common_names: string;
  iucn_code: IucnCode;
  sarawak_protected: number;
  newer_name: string | null;
  summary: string;
  about: string;
  habitat: string;
  uses: string;
};

/** One row of public_records. */
type PublicRecordRow = {
  id: string;
  tag_code: string;
  species_slug: string | null;
  species_name: string;
  common_name: string | null;
  height_m: number | null;
  condition: PlantCondition | null;
  recorded_at: string;
};

/** One row of public_photos, with null for a photo that hasn't come down yet. */
type PublicPhotoRow = {
  species_slug: string;
  url: string;
  caption: string;
  credit: string;
  file: string | null;
};

/** One row of scan_history. */
type ScanRow = {
  tag_code: string;
  scanned_at: string;
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
    reviewStatus: row.review_status ?? undefined,
    reviewNotes: row.review_notes ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
  };
}

function toPhoto(row: PhotoRow): RecordPhoto {
  return {
    recordId: row.record_id,
    position: row.position,
    path: row.path,
    uploadedAt: row.uploaded_at ?? undefined,
    problem: row.upload_problem ?? undefined,
  };
}

/** Writes one new record on the connection it's given. */
function insertRecord(on: SQLiteDatabase, record: PlantRecord) {
  return on.runAsync(
    `INSERT INTO plant_records (
      id, tag_code, species_name, species_slug, common_name, height_m, condition, notes,
      latitude, longitude, accuracy_m, captured_at, photo_count, recorded_at, sync_status,
      upload_problem, uploaded_by
    ) VALUES (
      $id, $tagCode, $speciesName, $speciesSlug, $commonName, $heightM, $condition, $notes,
      $latitude, $longitude, $accuracyM, $capturedAt, $photoCount, $recordedAt, $syncStatus,
      $uploadProblem, $uploadedBy
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
      $uploadedBy: record.uploadedBy ?? null,
    },
  );
}

function toSpecies(row: SpeciesRow): SpeciesOption {
  return {
    slug: row.slug,
    scientificName: row.scientific_name,
    commonNames: JSON.parse(row.common_names) as string[],
  };
}

function toPublicSpecies(row: PublicSpeciesRow): PublicSpecies {
  return {
    slug: row.slug,
    scientificName: row.scientific_name,
    authority: row.authority,
    family: row.family,
    commonNames: JSON.parse(row.common_names) as string[],
    iucnCode: row.iucn_code,
    sarawakProtected: row.sarawak_protected === 1,
    newerName: row.newer_name ?? undefined,
    summary: row.summary,
    about: row.about,
    habitat: row.habitat,
    uses: row.uses,
  };
}

function toPublicRecord(row: PublicRecordRow): PublicRecord {
  return {
    id: row.id,
    tagCode: row.tag_code,
    speciesSlug: row.species_slug ?? undefined,
    speciesName: row.species_name,
    commonName: row.common_name ?? undefined,
    heightM: row.height_m ?? undefined,
    condition: row.condition ?? undefined,
    recordedAt: row.recorded_at,
  };
}

function toPublicPhoto(row: PublicPhotoRow): PublicPhoto {
  return {
    speciesSlug: row.species_slug,
    url: row.url,
    caption: row.caption,
    credit: row.credit,
    file: row.file ?? undefined,
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

    async saveRecord(record, photoPaths = []) {
      // A record with no photos is one write, which can't half happen, and it's the quicker path.
      if (photoPaths.length === 0) {
        await insertRecord(db, record);
        return;
      }
      await inOwnTransaction(db, async (txn) => {
        await insertRecord(txn, record);
        for (const [index, path] of photoPaths.entries()) {
          await txn.runAsync(
            `INSERT INTO record_photos (record_id, position, path)
            VALUES ($recordId, $position, $path)`,
            { $recordId: record.id, $position: index + 1, $path: path },
          );
        }
      });
    },

    async loadWaiting() {
      const rows = await db.getAllAsync<RecordRow>(
        "SELECT * FROM plant_records WHERE sync_status = 'pending' ORDER BY recorded_at, rowid",
      );
      return rows.map(toRecord);
    },

    async saveUploadOutcome(id, outcome, uploadedBy) {
      // Nothing changes when it should be tried again. A problem from an earlier try stays,
      // because no signal doesn't mean it's been sorted out.
      if (outcome.kind === 'retry') {
        return;
      }
      if (outcome.kind === 'synced') {
        await db.runAsync(
          `UPDATE plant_records
          SET sync_status = 'synced', upload_problem = NULL, uploaded_by = $uploadedBy
          WHERE id = $id`,
          { $id: id, $uploadedBy: uploadedBy ?? null },
        );
      } else {
        await db.runAsync('UPDATE plant_records SET upload_problem = $problem WHERE id = $id', {
          $id: id,
          $problem: outcome.problem,
        });
      }
    },

    async removeDeleted(id) {
      await inOwnTransaction(db, async (txn) => {
        const { changes } = await txn.runAsync(
          "DELETE FROM plant_records WHERE id = $id AND upload_problem = 'deleted'",
          { $id: id },
        );
        if (changes === 0) {
          throw new Error(NOT_DELETED);
        }
        await txn.runAsync('DELETE FROM record_photos WHERE record_id = $id', { $id: id });
      });
    },

    async loadSyncedIds() {
      const rows = await db.getAllAsync<{ id: string }>(
        "SELECT id FROM plant_records WHERE sync_status = 'synced'",
      );
      return rows.map((row) => row.id);
    },

    async saveReviews(reviews) {
      // No transaction, because rolling one back could also undo a record being saved at the same
      // time. Each update stands alone and the next sync repeats it, and only rows that changed
      // get written, so a sync with no news costs next to nothing.
      for (const review of reviews) {
        await db.runAsync(
          `UPDATE plant_records SET review_status = $status, review_notes = $notes
          WHERE id = $id AND (review_status IS NOT $status OR review_notes IS NOT $notes)`,
          { $id: review.id, $status: review.status, $notes: review.notes },
        );
      }
    },

    async renewTag(id, newId, newTagCode) {
      await inOwnTransaction(db, async (txn) => {
        const { changes } = await txn.runAsync(
          `UPDATE plant_records SET id = $newId, tag_code = $newTagCode, upload_problem = NULL
          WHERE id = $id AND upload_problem = 'tag-clash'`,
          { $id: id, $newId: newId, $newTagCode: newTagCode },
        );
        if (changes === 0) {
          throw new Error(NOT_TAG_CLASH);
        }
        await txn.runAsync('UPDATE record_photos SET record_id = $newId WHERE record_id = $id', {
          $id: id,
          $newId: newId,
        });
      });
    },

    async loadPhotos() {
      const rows = await db.getAllAsync<PhotoRow>(
        'SELECT * FROM record_photos ORDER BY record_id, position',
      );
      return rows.map(toPhoto);
    },

    async loadPhotosToUpload(accountId) {
      const rows = await db.getAllAsync<PhotoRow>(
        `SELECT photo.* FROM record_photos AS photo
        JOIN plant_records AS record ON record.id = photo.record_id
        WHERE record.sync_status = 'synced' AND record.uploaded_by = $accountId
          AND photo.uploaded_at IS NULL
        ORDER BY record.recorded_at, record.rowid, photo.position`,
        { $accountId: accountId },
      );
      return rows.map(toPhoto);
    },

    async savePhotoOutcome(recordId, position, outcome) {
      if (outcome.kind === 'uploaded') {
        await db.runAsync(
          `UPDATE record_photos SET uploaded_at = $uploadedAt, upload_problem = NULL
          WHERE record_id = $recordId AND position = $position`,
          { $recordId: recordId, $position: position, $uploadedAt: outcome.uploadedAt },
        );
      } else {
        await db.runAsync(
          `UPDATE record_photos SET upload_problem = $problem
          WHERE record_id = $recordId AND position = $position`,
          { $recordId: recordId, $position: position, $problem: outcome.problem },
        );
      }
    },

    async loadLastSynced() {
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = 'last_synced'",
      );
      return row?.value ?? null;
    },

    async saveLastSynced(finishedAt) {
      await db.runAsync(
        `INSERT INTO sync_meta (key, value) VALUES ('last_synced', $value)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        { $value: finishedAt },
      );
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
      await inOwnTransaction(db, async (txn) => {
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
    },

    async loadPublicCopy() {
      // The rows go in the order the copy came down, so rowid keeps that order. These are three
      // reads and not one, but nothing replaces the copy until the app has finished opening.
      const species = await db.getAllAsync<PublicSpeciesRow>(
        'SELECT * FROM public_species ORDER BY rowid',
      );
      const records = await db.getAllAsync<PublicRecordRow>(
        'SELECT * FROM public_records ORDER BY rowid',
      );
      const downloaded = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = 'public_copy_at'",
      );
      return {
        species: species.map(toPublicSpecies),
        records: records.map(toPublicRecord),
        downloadedAt: downloaded?.value ?? null,
      };
    },

    async replacePublicCopy(species, records, downloadedAt, photos) {
      if (species.length === 0) {
        throw new Error(EMPTY_PUBLIC_COPY);
      }
      // The time goes in the same transaction, so it always says when the saved copy came down.
      // It has its own key and not last_synced, because a phone that has synced counts as a staff
      // phone when the app opens.
      await inOwnTransaction(db, async (txn) => {
        await txn.runAsync('DELETE FROM public_species');
        await txn.runAsync('DELETE FROM public_records');
        // The saved photos are read after the first write, when no other connection can change
        // them, so a photo copy noted just before this isn't lost.
        const savedPhotos = await txn.getAllAsync<PublicPhotoRow>(
          'SELECT * FROM public_photos ORDER BY rowid',
        );
        const kept = keptPhotos(
          photos,
          savedPhotos.map(toPublicPhoto),
          new Set(species.map((item) => item.slug)),
        );
        await txn.runAsync('DELETE FROM public_photos');
        for (const item of species) {
          await txn.runAsync(
            `INSERT INTO public_species (slug, scientific_name, authority, family, common_names,
              iucn_code, sarawak_protected, newer_name, summary, about, habitat, uses)
            VALUES ($slug, $scientificName, $authority, $family, $commonNames, $iucnCode,
              $sarawakProtected, $newerName, $summary, $about, $habitat, $uses)`,
            {
              $slug: item.slug,
              $scientificName: item.scientificName,
              $authority: item.authority,
              $family: item.family,
              $commonNames: JSON.stringify(item.commonNames),
              $iucnCode: item.iucnCode,
              $sarawakProtected: item.sarawakProtected ? 1 : 0,
              $newerName: item.newerName ?? null,
              $summary: item.summary,
              $about: item.about,
              $habitat: item.habitat,
              $uses: item.uses,
            },
          );
        }
        for (const record of records) {
          await txn.runAsync(
            `INSERT INTO public_records (id, tag_code, species_slug, species_name, common_name,
              height_m, condition, recorded_at)
            VALUES ($id, $tagCode, $speciesSlug, $speciesName, $commonName, $heightM, $condition,
              $recordedAt)`,
            {
              $id: record.id,
              $tagCode: record.tagCode,
              $speciesSlug: record.speciesSlug ?? null,
              $speciesName: record.speciesName,
              $commonName: record.commonName ?? null,
              $heightM: record.heightM ?? null,
              $condition: record.condition ?? null,
              $recordedAt: record.recordedAt,
            },
          );
        }
        for (const photo of kept) {
          await txn.runAsync(
            `INSERT INTO public_photos (species_slug, url, caption, credit, file)
            VALUES ($speciesSlug, $url, $caption, $credit, $file)`,
            {
              $speciesSlug: photo.speciesSlug,
              $url: photo.url,
              $caption: photo.caption,
              $credit: photo.credit,
              $file: photo.file ?? null,
            },
          );
        }
        await txn.runAsync(
          `INSERT INTO sync_meta (key, value) VALUES ('public_copy_at', $value)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          { $value: downloadedAt },
        );
      });
    },

    async loadPublicPhotos() {
      const rows = await db.getAllAsync<PublicPhotoRow>(
        'SELECT * FROM public_photos ORDER BY rowid',
      );
      return rows.map(toPublicPhoto);
    },

    async savePublicPhotoFile(speciesSlug, url, file) {
      // Only the photo the copy was made from, and only once, so a photo that changed on the
      // server while it was downloading doesn't end up with the old picture.
      const result = await db.runAsync(
        `UPDATE public_photos SET file = $file
        WHERE species_slug = $speciesSlug AND url = $url AND file IS NULL`,
        { $file: file, $speciesSlug: speciesSlug, $url: url },
      );
      return result.changes > 0;
    },

    async loadScans() {
      // A tag scanned again keeps its rowid, so rowid only matters for two scans in the same
      // millisecond.
      const rows = await db.getAllAsync<ScanRow>(
        'SELECT tag_code, scanned_at FROM scan_history ORDER BY scanned_at DESC, rowid DESC',
      );
      return rows.map((row) => ({ tagCode: row.tag_code, scannedAt: row.scanned_at }));
    },

    async saveScan(tagCode, scannedAt) {
      await db.runAsync(
        `INSERT INTO scan_history (tag_code, scanned_at) VALUES ($tagCode, $scannedAt)
        ON CONFLICT (tag_code) DO UPDATE SET scanned_at = excluded.scanned_at`,
        { $tagCode: tagCode, $scannedAt: scannedAt },
      );
    },

    async clearScans() {
      await db.runAsync('DELETE FROM scan_history');
    },

    async loadMode() {
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = 'app_mode'",
      );
      const value = row?.value;
      return isAppMode(value) ? value : null;
    },

    async saveMode(mode) {
      await db.runAsync(
        `INSERT INTO sync_meta (key, value) VALUES ('app_mode', $value)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        { $value: mode },
      );
    },

    close() {
      return db.closeAsync();
    },
  };
}

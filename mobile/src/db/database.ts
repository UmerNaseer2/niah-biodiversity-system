import type { SQLiteDatabase } from 'expo-sqlite';

import { openEncryptedDatabase } from './encryption';

/** The SQLite file on the phone that holds the records. */
export const DATABASE_NAME = 'niah.db';

/** How long a write waits for one on another connection to finish before it fails. */
export const BUSY_TIMEOUT_MS = 5000;

/**
 * Each step takes the database up one version, and `PRAGMA user_version` remembers how many steps
 * have run on the phone. Never change a step once it's on someone's phone, because a phone that
 * already ran it won't run it again. Add a new step at the end instead.
 */
export const MIGRATIONS: readonly string[] = [
  // Version 1: plant records. The CHECK rules match the record types, so a bug in the app can't
  // save a record the upload would choke on. A location is all four parts or none.
  `CREATE TABLE plant_records (
    id TEXT PRIMARY KEY NOT NULL,
    tag_code TEXT NOT NULL UNIQUE,
    species_name TEXT NOT NULL CHECK (species_name <> ''),
    species_slug TEXT,
    common_name TEXT,
    height_m REAL CHECK (height_m IS NULL OR height_m > 0),
    condition TEXT NOT NULL CHECK (condition IN ('healthy', 'damaged', 'diseased', 'dead')),
    notes TEXT,
    latitude REAL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m REAL CHECK (accuracy_m >= 0),
    captured_at TEXT,
    photo_count INTEGER NOT NULL DEFAULT 0 CHECK (photo_count >= 0),
    recorded_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced')),
    CHECK (
      (latitude IS NULL AND longitude IS NULL AND accuracy_m IS NULL AND captured_at IS NULL)
      OR (latitude IS NOT NULL AND longitude IS NOT NULL AND accuracy_m IS NOT NULL
        AND captured_at IS NOT NULL)
    )
  ) STRICT;
  CREATE INDEX plant_records_recorded_at ON plant_records (recorded_at);`,

  // Version 2: the species list downloaded from Supabase when the phone syncs, so the
  // New Record form can suggest species added on the website without an app update. It stays
  // empty until the first download, and the form uses the list that comes with the app until
  // then. Names only, like the list in the app. The common names are a JSON array of text,
  // with the one the form fills in first.
  `CREATE TABLE species (
    slug TEXT PRIMARY KEY NOT NULL CHECK (slug <> ''),
    scientific_name TEXT NOT NULL CHECK (scientific_name <> ''),
    common_names TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(common_names) AND json_type(common_names) = 'array')
  ) STRICT;`,

  // Version 3: why a record couldn't upload (see UPLOAD_PROBLEMS in src/types/plant-record.ts),
  // so the phone can still say what to do about it after the app restarts. A record that's on
  // the server can't have one. Records saved before this step get null, which means no problem.
  `ALTER TABLE plant_records ADD COLUMN upload_problem TEXT CHECK (
    upload_problem IS NULL
    OR (sync_status = 'pending' AND upload_problem IN ('tag-clash', 'not-allowed', 'rejected'))
  );`,

  // Version 4: a fourth upload problem, 'deleted', for a record an officer deleted on the website
  // (supabase/010_deleted_records.sql). SQLite can't change a CHECK on a column, so this makes the
  // table again with the new rule and copies every record across. The rest of the table is the
  // same as after version 3, and the columns are named so nothing lands in the wrong one.
  `CREATE TABLE plant_records_new (
    id TEXT PRIMARY KEY NOT NULL,
    tag_code TEXT NOT NULL UNIQUE,
    species_name TEXT NOT NULL CHECK (species_name <> ''),
    species_slug TEXT,
    common_name TEXT,
    height_m REAL CHECK (height_m IS NULL OR height_m > 0),
    condition TEXT NOT NULL CHECK (condition IN ('healthy', 'damaged', 'diseased', 'dead')),
    notes TEXT,
    latitude REAL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m REAL CHECK (accuracy_m >= 0),
    captured_at TEXT,
    photo_count INTEGER NOT NULL DEFAULT 0 CHECK (photo_count >= 0),
    recorded_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced')),
    upload_problem TEXT CHECK (
      upload_problem IS NULL
      OR (sync_status = 'pending'
        AND upload_problem IN ('tag-clash', 'not-allowed', 'rejected', 'deleted'))
    ),
    CHECK (
      (latitude IS NULL AND longitude IS NULL AND accuracy_m IS NULL AND captured_at IS NULL)
      OR (latitude IS NOT NULL AND longitude IS NOT NULL AND accuracy_m IS NOT NULL
        AND captured_at IS NOT NULL)
    )
  ) STRICT;
  INSERT INTO plant_records_new (id, tag_code, species_name, species_slug, common_name, height_m,
    condition, notes, latitude, longitude, accuracy_m, captured_at, photo_count, recorded_at,
    sync_status, upload_problem)
  SELECT id, tag_code, species_name, species_slug, common_name, height_m, condition, notes,
    latitude, longitude, accuracy_m, captured_at, photo_count, recorded_at, sync_status,
    upload_problem
  FROM plant_records;
  DROP TABLE plant_records;
  ALTER TABLE plant_records_new RENAME TO plant_records;
  CREATE INDEX plant_records_recorded_at ON plant_records (recorded_at);`,

  // Version 5: what an officer decided about a record once it's on the server, read back when the
  // phone syncs, so a ranger can see why a record was rejected even with no signal. Null means the
  // phone hasn't heard yet. sync_meta holds small things about syncing, like when it last worked.
  `ALTER TABLE plant_records ADD COLUMN review_status TEXT CHECK (
    review_status IS NULL OR review_status IN ('waiting', 'published', 'rejected')
  );
  ALTER TABLE plant_records ADD COLUMN review_notes TEXT;
  CREATE TABLE sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  ) STRICT;`,

  // Version 6: the photos taken with each record. The files themselves are in the app's document
  // folder, and path is relative to it, because the folder's full path can change when iOS updates
  // the app. uploaded_by is the account that sent the record, because the website looks for its
  // photos in that account's folder. No foreign key, because the app doesn't turn them on, so the
  // store changes both tables in one transaction instead.
  `ALTER TABLE plant_records ADD COLUMN uploaded_by TEXT;
  CREATE TABLE record_photos (
    record_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 1),
    path TEXT NOT NULL,
    uploaded_at TEXT,
    upload_problem TEXT CHECK (upload_problem IS NULL OR upload_problem IN ('missing', 'rejected')),
    PRIMARY KEY (record_id, position)
  ) STRICT;`,
];

/**
 * The database was made by a newer copy of the app. Trying again won't help, only updating will,
 * so the app tells these apart from other errors.
 */
export class DatabaseTooNewError extends Error {
  constructor(version: number, known: number) {
    super(
      `The database on this phone is version ${version}, but this app only knows up to version ` +
        `${known}. Update the app.`,
    );
    this.name = 'DatabaseTooNewError';
  }
}

/**
 * Runs the steps this phone hasn't run yet. Each one runs in a transaction together with the
 * version bump, so a step that fails leaves the database the way it was before that step.
 */
export async function migrate(db: SQLiteDatabase, steps: readonly string[] = MIGRATIONS) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version > steps.length) {
    // An older copy of the app can't know what a newer one changed, so it doesn't touch the file.
    throw new DatabaseTooNewError(version, steps.length);
  }
  if (version === 0) {
    // A brand new file. WAL lets the app read while it writes, and the file keeps the setting.
    // It can't be changed inside a transaction, so it goes before the steps.
    await db.execAsync('PRAGMA journal_mode = WAL');
  }
  for (let done = version; done < steps.length; done++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(steps[done]);
      await db.execAsync(`PRAGMA user_version = ${done + 1}`);
    });
  }
}

/** Opens the records database and brings it up to date. */
export async function openDatabase() {
  const db = await openEncryptedDatabase(DATABASE_NAME);
  try {
    // Replacing the species list writes on a second connection (see records-store.ts). If a
    // record is saved while that's happening, this waits up to 5 seconds for it to finish instead
    // of failing straight away. It only lasts while the connection is open, so it isn't a step,
    // and the second connection has to set it again for itself.
    await db.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    await migrate(db);
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
}

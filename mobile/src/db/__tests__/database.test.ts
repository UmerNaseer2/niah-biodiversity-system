import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import {
  DATABASE_NAME,
  DatabaseTooNewError,
  migrate,
  MIGRATIONS,
  openDatabase,
} from '@/db/database';

// expo-sqlite needs a phone, so the tests run on sql.js instead (jest/expo-sqlite.js). It's the
// same SQLite underneath, so the SQL and the rules in the tables behave the same.

async function versionOf(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version;
}

async function tablesIn(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  return rows.map((row) => row.name);
}

beforeEach(async () => {
  await deleteDatabaseAsync(DATABASE_NAME);
});

describe('openDatabase', () => {
  it('sets up a new database at the latest version', async () => {
    const db = await openDatabase();
    try {
      expect(await versionOf(db)).toBe(MIGRATIONS.length);
      expect(await tablesIn(db)).toEqual(['plant_records', 'species', 'sync_meta']);
      const journal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
      expect(journal?.journal_mode).toBe('wal');
    } finally {
      await db.closeAsync();
    }
  });

  it("doesn't run the steps again when the database is opened again", async () => {
    const first = await openDatabase();
    await first.runAsync(
      `INSERT INTO plant_records (id, tag_code, species_name, condition, recorded_at)
      VALUES ('6b1e4d2a-7c3f-4e8b-9a5d-1f2e3c4b5a60', 'NNP-6B1E4D', 'Ficus sp.', 'healthy',
        '2026-10-16T01:13:02.000Z')`,
    );
    await first.closeAsync();

    // Running the first step again would fail, because the table is already there.
    const second = await openDatabase();
    try {
      expect(await versionOf(second)).toBe(MIGRATIONS.length);
      expect(await second.getAllAsync('SELECT tag_code FROM plant_records')).toEqual([
        { tag_code: 'NNP-6B1E4D' },
      ]);
    } finally {
      await second.closeAsync();
    }
  });

  it('brings a phone on the first version up to date and keeps its records', async () => {
    // The database the Sprint #1 app made, with one record waiting to sync.
    const old = await openDatabaseAsync(DATABASE_NAME);
    await migrate(old, MIGRATIONS.slice(0, 1));
    await old.runAsync(
      `INSERT INTO plant_records (id, tag_code, species_name, condition, recorded_at)
      VALUES ('6b1e4d2a-7c3f-4e8b-9a5d-1f2e3c4b5a60', 'NNP-6B1E4D', 'Ficus sp.', 'healthy',
        '2026-10-16T01:13:02.000Z')`,
    );
    await old.closeAsync();

    const db = await openDatabase();
    try {
      expect(await versionOf(db)).toBe(MIGRATIONS.length);
      expect(await tablesIn(db)).toEqual(['plant_records', 'species', 'sync_meta']);
      expect(
        await db.getAllAsync('SELECT tag_code, sync_status, upload_problem FROM plant_records'),
      ).toEqual([
        {
          tag_code: 'NNP-6B1E4D',
          sync_status: 'pending',
          upload_problem: null,
        },
      ]);
      expect(await db.getAllAsync('SELECT * FROM species')).toEqual([]);
    } finally {
      await db.closeAsync();
    }
  });

  it('keeps every record and its upload problem when the table is made again in version 4', async () => {
    // A phone on version 3, with one record that couldn't upload, one waiting and one synced.
    const old = await openDatabaseAsync(DATABASE_NAME);
    await migrate(old, MIGRATIONS.slice(0, 3));
    await old.runAsync(
      `INSERT INTO plant_records (id, tag_code, species_name, species_slug, common_name, height_m,
        condition, notes, latitude, longitude, accuracy_m, captured_at, photo_count, recorded_at,
        sync_status, upload_problem)
      VALUES
        ('6b1e4d2a-7c3f-4e8b-9a5d-1f2e3c4b5a60', 'NNP-6B1E4D', 'Ficus sp.', NULL, NULL, NULL,
          'healthy', NULL, NULL, NULL, NULL, NULL, 0, '2026-10-16T01:13:02.000Z', 'pending',
          'tag-clash'),
        ('0c9d8e7f-6a5b-4c3d-8e2f-1a0b9c8d7e6f', 'NNP-0C9D8E', 'Koompassia excelsa', 'tapang',
          'Tapang', 31.5, 'damaged', 'Bark split on the north side', 3.81391, 113.77874, 8,
          '2026-10-17T02:00:00.000Z', 2, '2026-10-17T02:00:05.000Z', 'pending', NULL),
        ('5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170', 'NNP-5E4D3C', 'Ficus sp.', NULL, NULL, NULL,
          'dead', NULL, NULL, NULL, NULL, NULL, 1, '2026-10-18T03:00:00.000Z', 'synced', NULL)`,
    );
    const before = await old.getAllAsync('SELECT * FROM plant_records ORDER BY id');
    await old.closeAsync();

    const db = await openDatabase();
    try {
      expect(await versionOf(db)).toBe(MIGRATIONS.length);
      expect(await tablesIn(db)).toEqual(['plant_records', 'species', 'sync_meta']);
      // Version 5 adds two columns, and nobody has heard from an officer yet.
      expect(await db.getAllAsync('SELECT * FROM plant_records ORDER BY id')).toEqual(
        before.map((row) => Object.assign({}, row, { review_status: null, review_notes: null })),
      );
      const indexes = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'",
      );
      expect(indexes).toEqual([{ name: 'plant_records_recorded_at' }]);

      // The new problem goes in now, and the old rules still hold.
      await db.runAsync(
        "UPDATE plant_records SET upload_problem = 'deleted' WHERE tag_code = 'NNP-0C9D8E'",
      );
      await expect(
        db.runAsync(
          "UPDATE plant_records SET upload_problem = 'deleted' WHERE tag_code = 'NNP-5E4D3C'",
        ),
      ).rejects.toThrow('CHECK constraint failed');
      await expect(
        db.runAsync(
          "UPDATE plant_records SET tag_code = 'NNP-6B1E4D' WHERE tag_code = 'NNP-5E4D3C'",
        ),
      ).rejects.toThrow('UNIQUE constraint failed');
      await expect(
        db.runAsync("UPDATE plant_records SET latitude = NULL WHERE tag_code = 'NNP-0C9D8E'"),
      ).rejects.toThrow('CHECK constraint failed');
      await expect(
        db.runAsync("UPDATE plant_records SET photo_count = 'two' WHERE tag_code = 'NNP-0C9D8E'"),
      ).rejects.toThrow('cannot store TEXT value in INTEGER column');
    } finally {
      await db.closeAsync();
    }
  });

  it('adds the review columns in version 5 and only takes statuses the server has', async () => {
    const old = await openDatabaseAsync(DATABASE_NAME);
    await migrate(old, MIGRATIONS.slice(0, 4));
    await old.runAsync(
      `INSERT INTO plant_records (id, tag_code, species_name, condition, recorded_at, sync_status)
      VALUES ('5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170', 'NNP-5E4D3C', 'Ficus sp.', 'healthy',
        '2026-10-18T03:00:00.000Z', 'synced')`,
    );
    await old.closeAsync();

    const db = await openDatabase();
    try {
      expect(
        await db.getAllAsync('SELECT tag_code, review_status, review_notes FROM plant_records'),
      ).toEqual([{ tag_code: 'NNP-5E4D3C', review_status: null, review_notes: null }]);
      await db.runAsync("UPDATE plant_records SET review_status = 'rejected'");
      await expect(db.runAsync("UPDATE plant_records SET review_status = 'lost'")).rejects.toThrow(
        'CHECK constraint failed',
      );
      await db.runAsync("INSERT INTO sync_meta (key, value) VALUES ('last_synced', 'then')");
      expect(await db.getAllAsync('SELECT * FROM sync_meta')).toEqual([
        { key: 'last_synced', value: 'then' },
      ]);
    } finally {
      await db.closeAsync();
    }
  });

  it('only lets a record that is still waiting have an upload problem', async () => {
    const db = await openDatabase();
    try {
      await db.runAsync(
        `INSERT INTO plant_records (id, tag_code, species_name, condition, recorded_at)
        VALUES ('6b1e4d2a-7c3f-4e8b-9a5d-1f2e3c4b5a60', 'NNP-6B1E4D', 'Ficus sp.', 'healthy',
          '2026-10-16T01:13:02.000Z')`,
      );
      await db.runAsync("UPDATE plant_records SET upload_problem = 'tag-clash'");
      // Marking it as synced without clearing the problem would leave a synced record with one.
      await expect(db.runAsync("UPDATE plant_records SET sync_status = 'synced'")).rejects.toThrow(
        'CHECK constraint failed',
      );
      await expect(db.runAsync("UPDATE plant_records SET upload_problem = 'lost'")).rejects.toThrow(
        'CHECK constraint failed',
      );
      await db.runAsync("UPDATE plant_records SET sync_status = 'synced', upload_problem = NULL");
      await expect(
        db.runAsync("UPDATE plant_records SET upload_problem = 'rejected'"),
      ).rejects.toThrow('CHECK constraint failed');
    } finally {
      await db.closeAsync();
    }
  });

  it('leaves a database from a newer copy of the app alone and says to update', async () => {
    const newer = MIGRATIONS.length + 1;
    const setup = await openDatabaseAsync(DATABASE_NAME);
    await setup.execAsync(`PRAGMA user_version = ${newer}`);
    await setup.closeAsync();

    const opening = openDatabase();
    await expect(opening).rejects.toThrow(
      `The database on this phone is version ${newer}, but this app only knows up to version ` +
        `${MIGRATIONS.length}. Update the app.`,
    );
    // The screen uses the kind of error to say update instead of try again.
    await expect(opening).rejects.toBeInstanceOf(DatabaseTooNewError);

    const check = await openDatabaseAsync(DATABASE_NAME);
    expect(await versionOf(check)).toBe(newer);
    expect(await tablesIn(check)).toEqual([]);
    await check.closeAsync();
    // The phone won't delete a database that's still open, so this shows openDatabase closed its
    // connection when it gave up.
    await expect(deleteDatabaseAsync(DATABASE_NAME)).resolves.toBeUndefined();
  });
});

describe('migrate', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    db = await openDatabaseAsync(DATABASE_NAME);
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('undoes a step that fails, version bump and all', async () => {
    const steps = [
      'CREATE TABLE first_step (id INTEGER PRIMARY KEY);',
      'CREATE TABLE second_step (id INTEGER PRIMARY KEY); INSERT INTO no_such_table VALUES (1);',
    ];
    await expect(migrate(db, steps)).rejects.toThrow('no such table: no_such_table');

    // The first step stays done. The second one is undone, so it runs again next time.
    expect(await versionOf(db)).toBe(1);
    expect(await tablesIn(db)).toEqual(['first_step']);
  });

  it('only runs the steps this phone has not run yet', async () => {
    const firstStep = 'CREATE TABLE first_step (id INTEGER PRIMARY KEY);';
    await migrate(db, [firstStep]);
    await db.runAsync('INSERT INTO first_step (id) VALUES (7)');

    await migrate(db, [firstStep, 'ALTER TABLE first_step ADD COLUMN note TEXT;']);
    expect(await versionOf(db)).toBe(2);
    expect(await db.getAllAsync('SELECT id, note FROM first_step')).toEqual([
      { id: 7, note: null },
    ]);
  });
});

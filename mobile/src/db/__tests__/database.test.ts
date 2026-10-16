import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { DATABASE_NAME, migrate, MIGRATIONS, openDatabase } from '@/db/database';

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
      expect(await tablesIn(db)).toEqual(['plant_records']);
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

  it('leaves a database from a newer copy of the app alone and says to update', async () => {
    const newer = MIGRATIONS.length + 1;
    const setup = await openDatabaseAsync(DATABASE_NAME);
    await setup.execAsync(`PRAGMA user_version = ${newer}`);
    await setup.closeAsync();

    await expect(openDatabase()).rejects.toThrow(
      `The database on this phone is version ${newer}, but this app only knows up to version ` +
        `${MIGRATIONS.length}. Update the app.`,
    );

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

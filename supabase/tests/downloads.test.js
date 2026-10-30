// Checks 011_exact_location_downloads.sql: the list of reports downloaded with exact spots. Who
// can add to it and read it, that a row always says who really downloaded the file and when, and
// that nobody can change or empty the list through the API.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { addUser, insertAs, newDatabase, readSql, selectAs, SQL_FILES } from './harness.js';

let db;
let botanist;
let researcher;
let visitor;
let officer;
let admin;

before(async () => {
  db = await newDatabase();
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
  researcher = await addUser(db, { role: 'researcher', name: 'Researcher' });
  visitor = await addUser(db, { name: 'Visitor' });
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
  admin = await addUser(db, { role: 'admin', name: 'Park admin' });
});

after(async () => {
  await db.close();
});

/** What the website sends for a download: the filters and the counts, nothing else. */
function download(changes = {}) {
  return {
    scope: 'all',
    from_day: '2026-10-01',
    to_day: '2026-10-31',
    row_count: 12,
    exact_count: 4,
    ...changes,
  };
}

function record(user, row = download()) {
  return insertAs(db, user, 'public.exact_location_downloads', row);
}

/** Reads the list straight from the table as the postgres user, so no rules get in the way. */
async function storedDownloads(user) {
  const { rows } = await db.query(
    'SELECT * FROM public.exact_location_downloads WHERE downloaded_by = $1 ORDER BY id',
    [user.id],
  );
  return rows;
}

const notAllowed = { code: '42501', message: /permission denied/ };
const notTheirRole = { code: '42501', message: /row-level security/ };

describe('downloads with exact spots', () => {
  test('officers and admins add a row with their name and the time filled in', async () => {
    for (const user of [officer, admin]) {
      const before = new Date();
      await record(user);
      const [row] = await storedDownloads(user);
      assert.equal(row.downloaded_by, user.id, user.name);
      assert.equal(row.downloaded_by_name, user.name, user.name);
      assert.ok(row.downloaded_at >= new Date(before.getTime() - 1000), user.name);
      assert.equal(row.scope, 'all');
      assert.equal(row.row_count, 12);
      assert.equal(row.exact_count, 4);
      assert.ok(row.from_day instanceof Date);
    }
  });

  test('a download with no dates picked keeps them empty', async () => {
    const someone = await addUser(db, { role: 'conservation_officer', name: 'No dates officer' });
    await record(someone, download({ scope: 'published', from_day: null, to_day: null }));
    const [row] = await storedDownloads(someone);
    assert.equal(row.scope, 'published');
    assert.equal(row.from_day, null);
    assert.equal(row.to_day, null);
  });

  test("a row can't say someone else downloaded it, or another time", async () => {
    for (const changes of [
      { downloaded_by: admin.id },
      { downloaded_by_name: 'Someone else' },
      { downloaded_at: '2026-01-01T00:00:00Z' },
    ]) {
      await assert.rejects(record(officer, download(changes)), notAllowed, Object.keys(changes)[0]);
    }
    // Postgres picks the number itself
    await assert.rejects(record(officer, download({ id: 999 })), { code: '428C9' });
  });

  test("botanists, researchers, visitors and people signed out can't add a row", async () => {
    for (const user of [botanist, researcher, visitor]) {
      await assert.rejects(record(user), notTheirRole, user.name);
      assert.deepEqual(await storedDownloads(user), [], user.name);
    }
    await assert.rejects(record(null), notAllowed);
  });

  test('only admins can read the list', async () => {
    await record(officer);
    const sql =
      'SELECT downloaded_by_name FROM public.exact_location_downloads WHERE downloaded_by = $1';
    const seen = await selectAs(db, admin, sql, [officer.id]);
    assert.ok(seen.length > 0);
    assert.ok(seen.every((row) => row.downloaded_by_name === officer.name));

    for (const user of [officer, botanist, researcher, visitor]) {
      assert.deepEqual(await selectAs(db, user, sql, [officer.id]), [], user.name);
    }
    await assert.rejects(selectAs(db, null, sql, [officer.id]), notAllowed);
  });

  test('nobody can change or empty the list through the API', async () => {
    await record(officer);
    const count = (await storedDownloads(officer)).length;
    for (const user of [admin, officer]) {
      await assert.rejects(
        selectAs(db, user, 'UPDATE public.exact_location_downloads SET row_count = 0'),
        notAllowed,
        `${user.name} changes`,
      );
      await assert.rejects(
        selectAs(db, user, 'DELETE FROM public.exact_location_downloads'),
        notAllowed,
        `${user.name} removes`,
      );
    }
    assert.equal((await storedDownloads(officer)).length, count);

    const { rows } = await db.query(
      `SELECT has_function_privilege('authenticated', 'public.fill_exact_location_download()',
        'EXECUTE') AS fill_it`,
    );
    assert.deepEqual(rows, [{ fill_it: false }]);
  });

  test('the database turns down counts and filters the website should never send', async () => {
    const broken = { code: '23514' };
    for (const changes of [
      { scope: 'everything' },
      { row_count: -1, exact_count: 0 },
      { row_count: 3, exact_count: 4 },
      { exact_count: -1 },
      { from_day: '2026-10-31', to_day: '2026-10-01' },
    ]) {
      await assert.rejects(record(admin, download(changes)), broken, JSON.stringify(changes));
    }
    await assert.rejects(record(admin, download({ scope: null })), { code: '23502' });
  });

  test('the row keeps the name after the account is deleted', async () => {
    const leaving = await addUser(db, { role: 'conservation_officer', name: 'Leaving officer' });
    await record(leaving);
    await db.query('DELETE FROM auth.users WHERE id = $1', [leaving.id]);

    const { rows } = await db.query(
      'SELECT downloaded_by FROM public.exact_location_downloads WHERE downloaded_by_name = $1',
      [leaving.name],
    );
    assert.deepEqual(rows, [{ downloaded_by: null }]);
  });

  test('a row added in the SQL editor is turned down, because nobody is signed in', async () => {
    await assert.rejects(
      db.query(
        `INSERT INTO public.exact_location_downloads (scope, row_count, exact_count)
         VALUES ('all', 1, 1)`,
      ),
      { code: '23502', message: /downloaded_by_name/ },
    );
  });

  test('running 011 again keeps the list, and 002 still runs after it', async () => {
    await record(admin);
    const before = await storedDownloads(admin);
    await db.exec(readSql('011_exact_location_downloads.sql'));
    await db.exec(readSql('002_seed_data.sql'));
    assert.deepEqual(await storedDownloads(admin), before);
    await assert.rejects(record(botanist), notTheirRole);
    await record(officer);
  });

  test("011 stops and changes nothing if 010 hasn't been run", async () => {
    const upTo009 = SQL_FILES.slice(0, SQL_FILES.indexOf('010_deleted_records.sql'));
    const without010 = await newDatabase(upTo009);
    try {
      await assert.rejects(
        without010.exec(readSql('011_exact_location_downloads.sql')),
        /011 needs 010_deleted_records\.sql to be run first/,
      );
      const { rows } = await without010.query(
        "SELECT to_regclass('public.exact_location_downloads') AS downloads",
      );
      assert.deepEqual(rows, [{ downloads: null }]);
    } finally {
      await without010.close();
    }
  });
});

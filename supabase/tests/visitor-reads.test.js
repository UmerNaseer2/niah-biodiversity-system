// Checks what the phone downloads so visitors can read about plants with no signal
// (mobile/src/sync/supabase-public-api.ts): the species info, the published records and the
// species photo lists. Visitors don't sign in, so the reads are as someone with no account. The
// column lists are read from that file, so a column added there has to get past these tests too.
// The phone never asks for the location column, since its plant pages don't say where a plant is.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { addUser, newDatabase, selectAs } from './harness.js';

const API_FILE = new URL('../../mobile/src/sync/supabase-public-api.ts', import.meta.url);
const API_SOURCE = readFileSync(API_FILE, 'utf8');

/** The quoted text the pattern finds in supabase-public-api.ts. */
function foundIn(pattern) {
  const match = API_SOURCE.match(pattern);
  assert.ok(match, `Nothing in supabase-public-api.ts matches ${pattern}`);
  return match[1];
}

/** A column list like the ones supabase-js takes, split into its columns. */
function columns(list) {
  return list.split(',').map((column) => column.trim());
}

const SPECIES_COLUMNS = columns(foundIn(/const SPECIES_COLUMNS =\s*'([^']+)'/));
const RECORD_COLUMNS = columns(foundIn(/const RECORD_COLUMNS =\s*'([^']+)'/));
const PHOTO_COLUMNS = columns(foundIn(/\.from\('species_photos_public'\)\s*\.select\('([^']+)'\)/));
const PHOTO_BUCKET = foundIn(/const PHOTO_BUCKET = '([^']+)'/);

/** The first page of a read the phone makes. It asks for 500 rows at a time, sorted by ID. */
function firstPage(view, list, filter = 'true') {
  return `SELECT ${list.join(', ')} FROM public.${view} WHERE ${filter} ORDER BY id LIMIT 500`;
}

const READ_SPECIES = firstPage('species_public', SPECIES_COLUMNS);
// The view only has published records, but the phone asks for them again as well.
const READ_RECORDS = firstPage('records_public', RECORD_COLUMNS, "status = 'published'");
const READ_PHOTOS = firstPage('species_photos_public', PHOTO_COLUMNS);

let db;
let botanist;

before(async () => {
  db = await newDatabase();
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
});

after(async () => {
  await db.close();
});

function ids(rows) {
  return rows.map((row) => row.id);
}

async function publishedCount() {
  const { rows } = await db.query(
    "SELECT count(*)::int AS count FROM public.records WHERE status = 'published'",
  );
  return rows[0].count;
}

describe('what the phone asks for', () => {
  test('it only reads the public views of species, records and species photos', () => {
    const views = [...API_SOURCE.matchAll(/\.from\('([^']+)'\)/g)].map((match) => match[1]);
    assert.deepEqual(views, ['species_public', 'records_public', 'species_photos_public']);
    assert.match(API_SOURCE, /\.from\('species_public'\)\s*\.select\(SPECIES_COLUMNS\)/);
    assert.match(
      API_SOURCE,
      /\.from\('records_public'\)\s*\.select\(RECORD_COLUMNS\)\s*\.eq\('status', 'published'\)/,
    );
  });

  // These lists are pinned on purpose. The plant pages don't say where a plant is, so a column
  // added to one has to be added here too, by someone who has checked it's fine for visitors.
  test('records come down with only the columns the plant pages use', () => {
    assert.deepEqual(RECORD_COLUMNS, [
      'id',
      'tag_code',
      'species_slug',
      'species_name',
      'common_name',
      'height_m',
      'condition',
      'recorded_at',
    ]);
  });

  test('species come down with only the columns the species pages use', () => {
    assert.deepEqual(SPECIES_COLUMNS, [
      'id',
      'scientific_name',
      'authority',
      'family',
      'common_names',
      'iucn_code',
      'sarawak_protected',
      'newer_name',
      'summary',
      'about',
      'description',
      'habitat',
      'uses',
    ]);
  });

  test('photo lists come down with only the species ID and its photos', () => {
    assert.deepEqual(PHOTO_COLUMNS, ['id', 'photos']);
  });

  test('photos the phone downloads from storage come from a public bucket', async () => {
    // The photos the field team takes of each record are kept in a private bucket, and the phone
    // never asks for those.
    assert.doesNotMatch(API_SOURCE, /record-photos/);
    const { rows } = await db.query('SELECT public FROM storage.buckets WHERE id = $1', [
      PHOTO_BUCKET,
    ]);
    assert.deepEqual(rows, [{ public: true }]);
  });
});

describe('reading it with no account', () => {
  test('every species column the phone asks for can be read', async () => {
    const rows = await selectAs(db, null, READ_SPECIES);
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), [...SPECIES_COLUMNS].sort());
    }
  });

  test('every published record comes down, with each column the phone asks for', async () => {
    const rows = await selectAs(db, null, READ_RECORDS);
    assert.ok(rows.length > 0);
    assert.equal(rows.length, await publishedCount());
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), [...RECORD_COLUMNS].sort());
    }
  });

  test('every species photo list can be read', async () => {
    const rows = await selectAs(db, null, READ_PHOTOS);
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), [...PHOTO_COLUMNS].sort());
      assert.ok(Array.isArray(row.photos));
    }
  });
});

describe('reading it signed in', () => {
  // Staff phones download the plant info too, so a staff scan of a tag with no record on the
  // phone can fall back to it.
  test('staff get the same lists, since a staff scan can fall back to them', async () => {
    for (const read of [READ_SPECIES, READ_RECORDS, READ_PHOTOS]) {
      const signedIn = await selectAs(db, botanist, read);
      const noAccount = await selectAs(db, null, read);
      assert.ok(signedIn.length > 0);
      assert.deepEqual(ids(signedIn), ids(noAccount));
      assert.deepEqual(Object.keys(signedIn[0]).sort(), Object.keys(noAccount[0]).sort());
    }
  });
});

// Checks 009_species_photos.sql: what the database lets into species.photos, who reads the photos
// through species_photos_public, saving photos the way the website does, and who deletes record
// photos.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { SQL_FILES, addUser, asUser, insertAs, newDatabase, readSql, selectAs } from './harness.js';

const sampleIds = [
  'dipterocarpus-sarawakensis',
  'eusideroxylon-zwageri',
  'koompassia-excelsa',
  'nepenthes-ampullaria',
  'paphiopedilum-barbatum',
  'shorea-macrophylla',
];

let db;
let visitor;
let researcher;
let botanist;
let officer;
let admin;

before(async () => {
  db = await newDatabase();
  visitor = await addUser(db, { name: 'Visitor' });
  researcher = await addUser(db, { role: 'researcher', name: 'Researcher' });
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
  admin = await addUser(db, { role: 'admin', name: 'Park admin' });
});

after(async () => {
  await db.close();
});

function run(user, sql, params = []) {
  return asUser(db, user, (tx) => tx.query(sql, params));
}

function who(user) {
  return user?.name ?? 'someone not signed in';
}

const notAllowed = { code: '42501', message: /permission denied/ };
// A week before the tests, for species that haven't changed in a while
const lastWeek = '2026-10-09T00:00:00.000Z';
const badPhotos = { code: '23514', message: /species_photos_check/ };

/** A new species the way the website's add a species form sends it. It starts with no photos. */
async function newSpecies() {
  const id = `testus-${randomUUID()}`;
  await insertAs(db, officer, 'public.species', {
    id,
    scientific_name: `Testus ${id.slice('testus-'.length)}`,
    authority: 'L.',
    family: 'Testaceae',
    common_names: ['Test plant'],
    iucn_code: 'LC',
    sarawak_protected: false,
    rough_area_only: false,
    summary: 'A plant for the tests.',
    about: null,
  });
  return id;
}

/** A photo the website uploaded, in the folder for the species. */
function uploaded(speciesId, changes = {}) {
  return {
    path: `species/${speciesId}/${randomUUID()}.jpg`,
    caption: 'Leaves and a flower bud',
    credit: 'SFC',
    isPrimary: false,
    ...changes,
  };
}

/** A photo from somewhere else, like the Unsplash placeholders. */
function linked(changes = {}) {
  return {
    url: 'https://example.test/belian.jpg',
    caption: 'Belian bark',
    credit: 'Unsplash',
    isPrimary: false,
    ...changes,
  };
}

/** Sets the photos straight on the table as the postgres user, so only the check is in the way. */
function setPhotos(id, photos) {
  return db.query('UPDATE public.species SET photos = $1 WHERE id = $2', [
    JSON.stringify(photos),
    id,
  ]);
}

/**
 * Saves the photos the way the website does, with
 * supabase.from('species').update({ photos }).eq('id', id).eq('photos', before).select('id'). The
 * second eq means it only saves if nobody else changed the photos since the page read them.
 */
async function savePhotos(user, id, before, photos) {
  const sql = `UPDATE public.species SET photos = $3
    WHERE id = $1 AND photos = $2::jsonb
    RETURNING id`;
  return (await run(user, sql, [id, JSON.stringify(before), JSON.stringify(photos)])).rows;
}

async function storedPhotos(id) {
  const { rows } = await db.query('SELECT photos FROM public.species WHERE id = $1', [id]);
  return rows[0].photos;
}

describe('the sample species', () => {
  test('still have their photos, and they pass the check', async () => {
    const { rows } = await db.query(
      'SELECT id, public.species_photos_ok(id, photos) AS ok FROM public.species ORDER BY id',
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      sampleIds,
    );
    assert.ok(rows.every((row) => row.ok));
    for (const id of sampleIds) {
      const photos = await storedPhotos(id);
      assert.equal(photos.length, 1, id);
      assert.equal(photos[0].credit, 'Unsplash', id);
    }
  });

  test('everyone reads the photos through species_photos_public', async () => {
    const { rows: stored } = await db.query(
      'SELECT id, slug, photos FROM public.species WHERE id = ANY($1) ORDER BY id',
      [sampleIds],
    );
    const sql = `SELECT id, slug, photos FROM public.species_photos_public
      WHERE id = ANY($1) ORDER BY id`;
    for (const user of [null, visitor, researcher, botanist, officer, admin]) {
      assert.deepEqual(await selectAs(db, user, sql, [sampleIds]), stored, who(user));
    }
  });
});

describe('what goes in species.photos', () => {
  test('takes no photos, uploaded photos, links and a mix of both', async () => {
    const id = await newSpecies();
    assert.deepEqual(await storedPhotos(id), []);

    const fine = [
      [],
      [uploaded(id, { isPrimary: true })],
      [linked({ isPrimary: true }), uploaded(id), uploaded(id)],
      [uploaded(id, { small: true }), uploaded(id, { small: false })],
      [{ url: 'https://example.test/a.jpg', caption: 'No main photo', credit: 'SFC' }],
      Array.from({ length: 12 }, () => uploaded(id)),
    ];
    for (const photos of fine) {
      await setPhotos(id, photos);
      assert.deepEqual(await storedPhotos(id), photos);
    }
  });

  test('turns down a list the website would never save', async () => {
    const id = await newSpecies();
    const other = await newSpecies();
    const samePath = uploaded(id);
    const { path } = uploaded(id);

    const bad = {
      'not a list': { path },
      'a photo that is just text': ['photo.jpg'],
      "a key it doesn't know": [uploaded(id, { gps: { lat: 3.81, lng: 113.78 } })],
      'a url and a path': [uploaded(id, { url: 'https://example.test/a.jpg' })],
      'no url or path': [{ caption: 'Leaves', credit: 'SFC' }],
      'an http link': [linked({ url: 'http://example.test/a.jpg' })],
      'a link with a space': [linked({ url: 'https://example.test/a b.jpg' })],
      'a link with a quote': [linked({ url: 'https://example.test/a".jpg' })],
      'a javascript link': [linked({ url: 'javascript:alert(1)' })],
      'a link that is too long': [linked({ url: `https://example.test/${'a'.repeat(500)}` })],
      'a url that is a number': [linked({ url: 7 })],
      'a path in another species folder': [uploaded(other)],
      'a path outside the species folder': [uploaded(id, { path: `${id}/${randomUUID()}.jpg` })],
      'a path that goes up a folder': [
        uploaded(id, { path: `species/${id}/../${randomUUID()}.jpg` }),
      ],
      'a png path': [uploaded(id, { path: path.replace(/\.jpg$/, '.png') })],
      'a path with no ID': [uploaded(id, { path: `species/${id}/photo.jpg` })],
      'the same path twice': [samePath, { ...samePath, caption: 'Again' }],
      'no caption': [{ path, credit: 'SFC' }],
      'a blank caption': [uploaded(id, { caption: '   ' })],
      'a caption that is too long': [uploaded(id, { caption: 'a'.repeat(301) })],
      'a caption that is not text': [uploaded(id, { caption: ['Leaves'] })],
      'no credit': [{ path, caption: 'Leaves' }],
      'a blank credit': [uploaded(id, { credit: '' })],
      'a credit that is too long': [uploaded(id, { credit: 'a'.repeat(201) })],
      'isPrimary as text': [uploaded(id, { isPrimary: 'true' })],
      'small as text': [uploaded(id, { small: 'true' })],
      'a small copy of a link': [linked({ small: true })],
      'two main photos': [uploaded(id, { isPrimary: true }), linked({ isPrimary: true })],
      'thirteen photos': Array.from({ length: 13 }, () => uploaded(id)),
      'a JSON null': null,
    };
    for (const [what, photos] of Object.entries(bad)) {
      await assert.rejects(setPhotos(id, photos), badPhotos, what);
    }
    assert.deepEqual(await storedPhotos(id), []);
  });

  test('a new species can only start with photos in its own folder', async () => {
    const id = `testus-${randomUUID()}`;
    const row = {
      id,
      scientific_name: `Testus ${id.slice('testus-'.length)}`,
      family: 'Testaceae',
      iucn_code: 'LC',
      summary: 'A plant for the tests.',
    };
    await assert.rejects(
      insertAs(db, officer, 'public.species', { ...row, photos: [uploaded('testus-other')] }),
      badPhotos,
    );
    const photos = [uploaded(id, { isPrimary: true })];
    await insertAs(db, officer, 'public.species', { ...row, photos });
    assert.deepEqual(await storedPhotos(id), photos);
  });
});

describe('saving photos from the website', () => {
  test('officers and admins save them, and updated_at changes', async () => {
    for (const user of [officer, admin]) {
      const id = await newSpecies();
      await db.query('UPDATE public.species SET updated_at = $1 WHERE id = $2', [lastWeek, id]);
      const photos = [uploaded(id, { isPrimary: true })];
      assert.deepEqual(await savePhotos(user, id, [], photos), [{ id }], who(user));
      assert.deepEqual(await storedPhotos(id), photos);
      const { rows } = await db.query('SELECT updated_at FROM public.species WHERE id = $1', [id]);
      assert.notEqual(new Date(rows[0].updated_at).toISOString(), lastWeek);
    }
  });

  test('everyone else changes nothing', async () => {
    const id = await newSpecies();
    const photos = [uploaded(id)];
    for (const user of [visitor, researcher, botanist]) {
      assert.deepEqual(await savePhotos(user, id, [], photos), [], who(user));
    }
    await assert.rejects(savePhotos(null, id, [], photos), notAllowed);
    assert.deepEqual(await storedPhotos(id), []);
  });

  test('saves nothing if someone else changed the photos first', async () => {
    const id = await newSpecies();
    const first = [uploaded(id, { isPrimary: true })];
    const second = [uploaded(id, { isPrimary: true })];
    // Two officers open the page while it has no photos, and both add one.
    assert.deepEqual(await savePhotos(officer, id, [], first), [{ id }]);
    assert.deepEqual(await savePhotos(admin, id, [], second), []);
    assert.deepEqual(await storedPhotos(id), first);
  });

  test('the same photos in a different key order still count as the same', async () => {
    const id = await newSpecies();
    const photo = uploaded(id);
    await setPhotos(id, [photo]);
    const reordered = {
      isPrimary: photo.isPrimary,
      credit: photo.credit,
      caption: photo.caption,
      path: photo.path,
    };
    const next = [{ ...photo, isPrimary: true }];
    assert.deepEqual(await savePhotos(officer, id, [reordered], next), [{ id }]);
  });

  test('nobody changes photos through species_photos_public', async () => {
    const id = await newSpecies();
    const changes = [
      ['UPDATE public.species_photos_public SET photos = $2 WHERE id = $1', [id, '[]']],
      [
        'INSERT INTO public.species_photos_public (id, slug, photos) VALUES ($1, $1, $2)',
        [id, '[]'],
      ],
      ['DELETE FROM public.species_photos_public WHERE id = $1', [id]],
    ];
    for (const user of [null, visitor, botanist, officer, admin]) {
      for (const [sql, params] of changes) {
        await assert.rejects(run(user, sql, params), notAllowed, `${who(user)}: ${sql}`);
      }
    }
  });
});

describe('photo files in Storage', () => {
  function uploadFile(user, name) {
    return insertAs(db, user, 'storage.objects', {
      bucket_id: 'botanical-photos',
      name,
      owner: user?.id ?? null,
    });
  }

  test('officers add and delete files where the website puts them, anyone sees them', async () => {
    const id = await newSpecies();
    const { path } = uploaded(id);
    assert.equal((await uploadFile(officer, path)).affectedRows, 1);
    const sql = `SELECT name FROM storage.objects
      WHERE bucket_id = 'botanical-photos' AND name = $1`;
    for (const user of [null, visitor, botanist]) {
      assert.deepEqual(await selectAs(db, user, sql, [path]), [{ name: path }], who(user));
    }
    const remove = "DELETE FROM storage.objects WHERE bucket_id = 'botanical-photos' AND name = $1";
    assert.equal((await run(botanist, remove, [path])).affectedRows, 0);
    assert.equal((await run(officer, remove, [path])).affectedRows, 1);
  });

  test('a file that is already there gives 23505, so an upload never replaces one', async () => {
    const { path } = uploaded(await newSpecies());
    await uploadFile(admin, path);
    await assert.rejects(uploadFile(admin, path), { code: '23505' });
  });
});

describe('record photos', () => {
  const remove = "DELETE FROM storage.objects WHERE bucket_id = 'record-photos' AND name = $1";

  /** A photo the phone uploaded for one of the botanist's records, in their own folder (005). */
  async function recordPhoto() {
    const name = `${botanist.id}/${randomUUID()}/1.jpg`;
    await insertAs(db, botanist, 'storage.objects', {
      bucket_id: 'record-photos',
      name,
      owner: botanist.id,
    });
    return name;
  }

  async function stillThere(name) {
    const { rows } = await db.query(
      "SELECT 1 FROM storage.objects WHERE bucket_id = 'record-photos' AND name = $1",
      [name],
    );
    return rows.length === 1;
  }

  test('officers and admins delete them', async () => {
    for (const user of [officer, admin]) {
      const name = await recordPhoto();
      assert.equal((await run(user, remove, [name])).affectedRows, 1, who(user));
      assert.equal(await stillThere(name), false, who(user));
    }
  });

  test('nobody else does, not even the botanist who took the photo', async () => {
    const name = await recordPhoto();
    for (const user of [null, visitor, researcher, botanist]) {
      assert.equal((await run(user, remove, [name])).affectedRows, 0, who(user));
    }
    assert.equal(await stillThere(name), true);
  });

  test('nobody replaces one, officers included', async () => {
    const name = await recordPhoto();
    const rename = `UPDATE storage.objects SET name = $2
      WHERE bucket_id = 'record-photos' AND name = $1`;
    for (const user of [botanist, officer, admin]) {
      const changes = [name, `${botanist.id}/${randomUUID()}/1.jpg`];
      assert.equal((await run(user, rename, changes)).affectedRows, 0, who(user));
    }
    assert.equal(await stillThere(name), true);
  });

  test('deleting a record photo leaves species photos alone', async () => {
    const { path } = uploaded(await newSpecies());
    await insertAs(db, officer, 'storage.objects', {
      bucket_id: 'botanical-photos',
      name: path,
      owner: officer.id,
    });
    const anyBucket = 'DELETE FROM storage.objects WHERE name = $1';
    assert.equal((await run(botanist, anyBucket, [path])).affectedRows, 0);
    assert.equal((await run(officer, anyBucket, [path])).affectedRows, 1);
  });
});

describe('running 009 again', () => {
  async function catalogs() {
    const queries = [
      `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'public.species'::regclass
       ORDER BY conname`,
      `SELECT definition FROM pg_views WHERE schemaname = 'public' ORDER BY viewname`,
      `SELECT relname, reloptions,
         ARRAY(SELECT acl::text FROM unnest(relacl) AS acl ORDER BY 1) AS acl
       FROM pg_class
       WHERE oid = 'public.species_photos_public'::regclass`,
      `SELECT prosrc, provolatile::text, proconfig
       FROM pg_proc
       WHERE oid = 'public.species_photos_ok(text, jsonb)'::regprocedure`,
      `SELECT policyname, cmd, roles::text[], qual, with_check
       FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects'
       ORDER BY policyname`,
    ];
    const results = [];
    for (const query of queries) {
      results.push((await db.query(query)).rows);
    }
    return results;
  }

  test('ends up the same and changes no photos', async () => {
    const firstTime = await catalogs();
    const allPhotos = 'SELECT id, photos FROM public.species ORDER BY id';
    const photosBefore = (await db.query(allPhotos)).rows;
    await db.exec(readSql('009_species_photos.sql'));
    assert.deepEqual(await catalogs(), firstTime);
    assert.deepEqual((await db.query(allPhotos)).rows, photosBefore);
  });

  test('the view only lets visitors read and reads as its owner', async () => {
    const [, , [view]] = await catalogs();
    assert.deepEqual(view.reloptions, ['security_invoker=false']);
    const { rows } = await db.query(
      `SELECT
         has_table_privilege('anon', 'public.species_photos_public', 'SELECT') AS anon_reads,
         has_table_privilege('authenticated', 'public.species_photos_public', 'SELECT')
           AS signed_in_reads,
         has_table_privilege('anon', 'public.species_photos_public', 'UPDATE') AS anon_changes,
         has_table_privilege('authenticated', 'public.species_photos_public', 'UPDATE')
           AS signed_in_changes`,
    );
    assert.deepEqual(rows[0], {
      anon_reads: true,
      signed_in_reads: true,
      anon_changes: false,
      signed_in_changes: false,
    });
  });

  test('007 and 002 still run after it', async () => {
    await db.exec(readSql('002_seed_data.sql'));
    await db.exec(readSql('007_species_fixes.sql'));
    for (const id of sampleIds) {
      assert.equal((await storedPhotos(id))[0].credit, 'Unsplash', id);
    }
  });

  test("stops and changes nothing if 008 hasn't been run", async () => {
    const upTo007 = SQL_FILES.slice(0, SQL_FILES.indexOf('008_record_edits.sql'));
    const without008 = await newDatabase(upTo007);
    try {
      await assert.rejects(
        without008.exec(readSql('009_species_photos.sql')),
        /009 needs 008_record_edits\.sql to be run first/,
      );
      const { rows } = await without008.query(
        "SELECT to_regclass('public.species_photos_public') AS view",
      );
      assert.deepEqual(rows, [{ view: null }]);
    } finally {
      await without008.close();
    }
  });
});

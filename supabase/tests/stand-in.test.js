// Checks the stand-in for our Supabase project (stand-in.js). Trying the website against it only
// proves something if it answers like Supabase does: signing in, refreshing and signing out, the
// same errors, and every read and change running as the right user, so our SQL files decide what
// each account gets.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { SERVICE_KEY } from './stand-in.js';
import { ANON_KEY, TEST_PASSWORD, TEST_USERS, startStandIn } from './stand-in.js';

const [officer, admin, botanist, researcher, visitor, noProfile] = TEST_USERS;

// Records from stand-in.js, and the Belian record from 002
const exactRecord = 'd00d0100-0000-4000-8000-000000000001';
const noSpeciesRecord = 'd00d0200-0000-4000-8000-000000000002';
const waitingRecord = 'd00d0300-0000-4000-8000-000000000003';
const rejectedRecord = 'd00d0400-0000-4000-8000-000000000004';
const belianRecord = '3f2a9c4e-8b1d-4c6a-9e2f-7a1b5c3d9e01';

// Everything records_public shows, and nothing else
const publicColumns = [
  'common_name',
  'condition',
  'gps',
  'height_m',
  'id',
  'photo_count',
  'recorded_at',
  'species_name',
  'species_slug',
  'status',
  'tag_code',
];

const representation = { Prefer: 'return=representation' };
const oneObject = { Accept: 'application/vnd.pgrst.object+json' };

let standIn;

before(async () => {
  standIn = await startStandIn({ port: 0, log: () => {} });
});

after(() => standIn.close());

/**
 * Calls a stand-in the way supabase-js does, with the anon key as the apikey header and as the
 * bearer token unless a user's token is given. null leaves a header out, and a string body is sent
 * as it is.
 */
async function callAt(url, path, options = {}) {
  const { method = 'GET', token = ANON_KEY, apikey = ANON_KEY, body, headers = {} } = options;
  const sent = { ...headers };
  if (apikey !== null) sent.apikey = apikey;
  if (token !== null) sent.Authorization = `Bearer ${token}`;
  if (body !== undefined) sent['Content-Type'] = 'application/json';
  const response = await fetch(`${url}${path}`, {
    method,
    headers: sent,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
  };
}

const call = (path, options) => callAt(standIn.url, path, options);

/** Signs in the way signInWithPassword does. */
function signIn(email, password = TEST_PASSWORD, url = standIn.url) {
  return callAt(url, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
}

/** Signs in as a test account and gives back its session. */
async function sessionFor(user, url = standIn.url) {
  const { status, body } = await signIn(user.email, TEST_PASSWORD, url);
  assert.equal(status, 200);
  return body;
}

function refresh(refreshToken, url = standIn.url) {
  return callAt(url, '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}

/** The claims in a JWT, without checking it. */
function claimsOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

/** A new species the way the website's add a species form sends it, like in species.test.js. */
function websiteRow(changes = {}) {
  const id = `testus-${randomUUID()}`;
  return {
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
    ...changes,
  };
}

/** A species straight from the database, as the superuser, or null. */
async function speciesInDb(id) {
  const { rows } = await standIn.db.query('SELECT * FROM public.species WHERE id = $1', [id]);
  return rows[0] ?? null;
}

describe('the anon key', () => {
  test('it only listens on this computer', () => {
    assert.match(standIn.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test('every request needs the anon key, like on Supabase', async () => {
    const missing = await call('/rest/v1/records_public', { apikey: null });
    assert.equal(missing.status, 401);
    assert.equal(missing.body.message, 'No API key found in request');

    const wrong = await call('/rest/v1/records_public', { apikey: 'not-the-anon-key' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.message, 'Invalid API key');

    const signingIn = await call('/auth/v1/token?grant_type=password', {
      method: 'POST',
      apikey: null,
      body: { email: officer.email, password: TEST_PASSWORD },
    });
    assert.equal(signingIn.status, 401);
  });

  test("a browser's preflight request works without the key", async () => {
    const response = await fetch(`${standIn.url}/rest/v1/records_public`, { method: 'OPTIONS' });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  });
});

describe('signing in', () => {
  test('the right password gives a session the website can use', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { status, body } = await signIn(officer.email);
    assert.equal(status, 200);
    assert.equal(body.token_type, 'bearer');
    assert.equal(body.expires_in, 3600);
    assert.ok(body.expires_at >= now + 3600 && body.expires_at <= now + 3601);
    assert.equal(typeof body.refresh_token, 'string');
    assert.equal(body.user.id, officer.id);
    assert.equal(body.user.email, officer.email);
    assert.deepEqual(body.user.user_metadata, { name: officer.name });

    const claims = claimsOf(body.access_token);
    assert.equal(claims.sub, officer.id);
    assert.equal(claims.role, 'authenticated');
    assert.equal(claims.aud, 'authenticated');
    assert.equal(claims.exp, body.expires_at);
    assert.equal(typeof claims.session_id, 'string');
  });

  test("capitals in the email don't matter", async () => {
    const { status, body } = await signIn(officer.email.toUpperCase());
    assert.equal(status, 200);
    assert.equal(body.user.id, officer.id);
  });

  test('a wrong password, no password and an unknown email all give the same error', async () => {
    const wrongPassword = await signIn(officer.email, 'not-the-password');
    assert.equal(wrongPassword.status, 400);
    assert.deepEqual(wrongPassword.body, {
      code: 400,
      error_code: 'invalid_credentials',
      msg: 'Invalid login credentials',
    });
    for (const [email, password] of [
      [officer.email, ''],
      ['nobody@example.test', TEST_PASSWORD],
    ]) {
      const { status, body } = await signIn(email, password);
      assert.equal(status, 400);
      assert.deepEqual(body, wrongPassword.body);
    }
  });

  test("there's no signing up, like our project with sign ups turned off", async () => {
    const email = 'new@example.test';
    const signUp = await call('/auth/v1/signup', {
      method: 'POST',
      body: { email, password: TEST_PASSWORD },
    });
    assert.equal(signUp.status, 422);
    assert.equal(signUp.body.error_code, 'signup_disabled');
    assert.equal((await signIn(email)).status, 400);
  });

  test('the user endpoint says who a token belongs to', async () => {
    const { access_token: token } = await sessionFor(admin);
    const { status, body } = await call('/auth/v1/user', { token });
    assert.equal(status, 200);
    assert.equal(body.id, admin.id);
    assert.equal(body.email, admin.email);
    assert.deepEqual(body.user_metadata, { name: admin.name });

    const noToken = await call('/auth/v1/user', { token: null });
    assert.equal(noToken.status, 401);
    assert.equal(noToken.body.error_code, 'no_authorization');
  });

  test("a token with someone else's ID put in it doesn't work anywhere", async () => {
    const { access_token: token } = await sessionFor(botanist);
    const [header, , signature] = token.split('.');
    const claims = Buffer.from(JSON.stringify({ ...claimsOf(token), sub: admin.id }));
    const forged = `${header}.${claims.toString('base64url')}.${signature}`;

    const user = await call('/auth/v1/user', { token: forged });
    assert.equal(user.status, 403);
    assert.equal(user.body.error_code, 'bad_jwt');

    const rows = await call('/rest/v1/profiles?select=role', { token: forged });
    assert.equal(rows.status, 401);
    assert.equal(rows.body.code, 'PGRST301');
  });
});

describe('reading as each account', () => {
  test('each account reads its own name and role the way the website does', async () => {
    for (const user of TEST_USERS) {
      const { access_token: token } = await sessionFor(user);
      const { status, body } = await call(`/rest/v1/profiles?select=name,role&id=eq.${user.id}`, {
        token,
      });
      assert.equal(status, 200);
      const expected = user.role === null ? [] : [{ name: user.name, role: user.role }];
      assert.deepEqual(body, expected, user.email);
    }
  });

  test('only the admin reads every profile', async () => {
    const asAdmin = await call('/rest/v1/profiles?select=id', {
      token: (await sessionFor(admin)).access_token,
    });
    assert.equal(asAdmin.body.length, TEST_USERS.length - 1);
    for (const user of [officer, botanist, researcher, visitor]) {
      const { body } = await call('/rest/v1/profiles?select=id', {
        token: (await sessionFor(user)).access_token,
      });
      assert.deepEqual(body, [{ id: user.id }], user.email);
    }
  });

  test('only officers and admins see the staff views', async () => {
    for (const user of [officer, admin]) {
      const { access_token: token } = await sessionFor(user);
      const records = await call('/rest/v1/records_staff?select=id,status', { token });
      assert.equal(records.status, 200);
      // The 6 sample records from 002 and the 4 from stand-in.js
      assert.equal(records.body.length, 10, user.email);
      const statuses = Object.fromEntries(records.body.map((row) => [row.id, row.status]));
      assert.equal(statuses[waitingRecord], 'waiting');
      assert.equal(statuses[rejectedRecord], 'rejected');

      const species = await call('/rest/v1/species_staff?select=id', { token });
      assert.ok(species.body.some((row) => row.id === 'standinia-exacta'), user.email);
    }
    for (const user of [botanist, researcher, visitor, noProfile]) {
      const { access_token: token } = await sessionFor(user);
      for (const name of ['records_staff', 'species_staff', 'records', 'species']) {
        const { status, body } = await call(`/rest/v1/${name}?select=id`, { token });
        assert.equal(status, 200);
        assert.deepEqual(body, [], `${user.email} reading ${name}`);
      }
    }
  });

  test('functions are called the way supabase.rpc() calls them, as whoever is asking', async () => {
    const counts = (token, body) =>
      call('/rest/v1/rpc/report_counts', { method: 'POST', token, body });
    const { access_token: officerToken } = await sessionFor(officer);
    const everything = await counts(officerToken, { scope: 'all', from_day: null, to_day: null });
    assert.equal(everything.status, 200);
    // The 10 records less the rejected one
    assert.equal(everything.body.total, 9);
    assert.equal(everything.body.waiting, 1);
    const oneDay = await counts(officerToken, { from_day: '2026-10-01', to_day: '2026-10-01' });
    assert.equal(oneDay.status, 200);
    assert.ok(oneDay.body.total < everything.body.total);

    const { access_token: botanistToken } = await sessionFor(botanist);
    const botanistCounts = await counts(botanistToken, { scope: 'all' });
    assert.equal(botanistCounts.status, 200);
    assert.equal(botanistCounts.body.total, 0);

    const signedOut = await counts(undefined, {});
    assert.equal(signedOut.status, 401);
    assert.equal(signedOut.body.code, '42501');

    for (const [path, body] of [
      ['/rest/v1/rpc/no_such_function', {}],
      ['/rest/v1/rpc/report_counts', { scope: 'all', drop_table: true }],
      ['/rest/v1/rpc/report_counts"()', {}],
    ]) {
      const missing = await call(path, { method: 'POST', token: officerToken, body });
      assert.equal(missing.status, 404, path);
      assert.equal(missing.body.code, 'PGRST202', path);
    }
    const badDay = await counts(officerToken, { from_day: 'yesterday-ish' });
    assert.equal(badDay.status, 400);
    assert.equal(badDay.body.code, '22007');
    const read = await call('/rest/v1/rpc/report_counts', { token: officerToken });
    assert.equal(read.status, 405);
  });

  test("people who aren't signed in can't read the tables or the staff views", async () => {
    const names = ['records', 'species', 'profiles', 'iot_nodes', 'records_staff', 'species_staff'];
    for (const name of names) {
      const { status, body } = await call(`/rest/v1/${name}?select=*`);
      assert.equal(status, 401, name);
      assert.equal(body.code, '42501', name);
    }
  });

  test('records_public shows published records, with an exact spot only when allowed', async () => {
    const { status, body } = await call('/rest/v1/records_public?select=*');
    assert.equal(status, 200);
    // The 6 sample records and the 2 published ones from stand-in.js
    assert.equal(body.length, 8);
    for (const row of body) {
      assert.deepEqual(Object.keys(row).sort(), publicColumns, row.id);
      assert.equal(row.status, 'published', row.id);
    }
    const gps = Object.fromEntries(body.map((row) => [row.id, row.gps]));
    assert.deepEqual(gps[exactRecord], { lat: 3.8152, lng: 113.7791, accuracyM: 5 });
    // A species the table doesn't have, and a threatened one, only show their grid square
    assert.deepEqual(gps[noSpeciesRecord], { lat: 3.814, lng: 113.782, accuracyM: 440 });
    assert.deepEqual(gps[belianRecord], { lat: 3.814, lng: 113.778, accuracyM: 440 });
    assert.equal(gps[waitingRecord], undefined);
    assert.equal(gps[rejectedRecord], undefined);
  });
});

describe('refreshing and signing out', () => {
  test('a refresh gives a new session, and two refreshes at once get the same one', async () => {
    const first = await sessionFor(officer);
    const second = await refresh(first.refresh_token);
    assert.equal(second.status, 200);
    assert.notEqual(second.body.refresh_token, first.refresh_token);
    assert.equal(
      claimsOf(second.body.access_token).session_id,
      claimsOf(first.access_token).session_id,
    );
    assert.equal((await call('/auth/v1/user', { token: second.body.access_token })).status, 200);

    // Two tabs refreshing at the same time both send the old refresh token
    const again = await refresh(first.refresh_token);
    assert.equal(again.status, 200);
    assert.equal(again.body.refresh_token, second.body.refresh_token);
  });

  test("a refresh token the stand-in didn't give out doesn't work", async () => {
    for (const token of ['not-a-refresh-token', 'constructor', undefined]) {
      const { status, body } = await refresh(token);
      assert.equal(status, 400);
      assert.equal(body.error_code, 'refresh_token_not_found');
    }
  });

  test('using an old refresh token after 10 seconds signs the whole session out', async (t) => {
    const first = await sessionFor(admin);
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const second = await refresh(first.refresh_token);
    assert.equal(second.status, 200);

    t.mock.timers.tick(11_000);
    const reused = await refresh(first.refresh_token);
    assert.equal(reused.status, 400);
    assert.equal(reused.body.error_code, 'refresh_token_already_used');

    // Someone else may have the token, so the newer tokens stop working too
    const user = await call('/auth/v1/user', { token: second.body.access_token });
    assert.equal(user.status, 403);
    assert.equal(user.body.error_code, 'session_not_found');
    const next = await refresh(second.body.refresh_token);
    assert.equal(next.status, 400);
    assert.equal(next.body.error_code, 'refresh_token_not_found');
  });

  test('signing out ends the session, but the REST API takes a JWT until it expires', async () => {
    const session = await sessionFor(botanist);
    const token = session.access_token;
    const signOut = () => call('/auth/v1/logout?scope=global', { method: 'POST', token });
    assert.equal((await signOut()).status, 204);

    const user = await call('/auth/v1/user', { token });
    assert.equal(user.status, 403);
    assert.equal(user.body.error_code, 'session_not_found');
    // supabase-js ignores this when signing out a second time
    assert.equal((await signOut()).status, 403);

    // Like Supabase, the REST API only checks the JWT itself, which is why the website asks Auth
    // who is signed in (getUser) instead of reading the cookie
    const rows = await call(`/rest/v1/profiles?select=role&id=eq.${botanist.id}`, { token });
    assert.equal(rows.status, 200);
    assert.deepEqual(rows.body, [{ role: 'botanist' }]);

    const next = await refresh(session.refresh_token);
    assert.equal(next.status, 400);
    assert.equal(next.body.error_code, 'refresh_token_not_found');
  });

  test("signing out of one browser keeps the account's other sessions", async () => {
    const [first, second, third] = [
      await sessionFor(researcher),
      await sessionFor(researcher),
      await sessionFor(researcher),
    ];
    const signOut = (session, scope) =>
      call(`/auth/v1/logout?scope=${scope}`, { method: 'POST', token: session.access_token });
    const works = async (session) =>
      (await call('/auth/v1/user', { token: session.access_token })).status === 200;

    assert.equal((await signOut(first, 'local')).status, 204);
    assert.deepEqual([await works(first), await works(second), await works(third)], [
      false,
      true,
      true,
    ]);
    assert.equal((await signOut(second, 'others')).status, 204);
    assert.deepEqual([await works(second), await works(third)], [true, false]);
  });
});

describe('changing rows like the website does', () => {
  test('an officer adds, edits and deletes a species', async () => {
    const { access_token: token } = await sessionFor(officer);
    const row = websiteRow();
    const path = `/rest/v1/species?id=eq.${row.id}&select=scientific_name`;

    const added = await call('/rest/v1/species', { method: 'POST', token, body: row });
    assert.equal(added.status, 201);
    assert.equal(added.body, null);
    assert.equal((await speciesInDb(row.id)).scientific_name, row.scientific_name);

    // .update().eq().select() and .delete().eq().select() ask for the changed rows back
    const edited = await call(path, {
      method: 'PATCH',
      token,
      body: { family: 'Testaceae', summary: 'Edited by the tests.' },
      headers: representation,
    });
    assert.equal(edited.status, 200);
    assert.deepEqual(edited.body, [{ scientific_name: row.scientific_name }]);
    assert.equal((await speciesInDb(row.id)).summary, 'Edited by the tests.');

    const deleted = await call(path, { method: 'DELETE', token, headers: representation });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body, [{ scientific_name: row.scientific_name }]);
    assert.equal(await speciesInDb(row.id), null);

    // Editing it now finds nothing, which the website tells the officer
    const tooLate = await call(path, {
      method: 'PATCH',
      token,
      body: { summary: 'Too late.' },
      headers: representation,
    });
    assert.equal(tooLate.status, 200);
    assert.deepEqual(tooLate.body, []);
  });

  test('adding a species twice gives the duplicate error the website looks for', async () => {
    const { access_token: token } = await sessionFor(admin);
    const row = websiteRow();
    const added = await call('/rest/v1/species', { method: 'POST', token, body: row });
    assert.equal(added.status, 201);
    const again = await call('/rest/v1/species', { method: 'POST', token, body: row });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, '23505');
    await standIn.db.query('DELETE FROM public.species WHERE id = $1', [row.id]);
  });

  test('only officers and admins change species', async () => {
    const row = websiteRow();
    const asAnon = await call('/rest/v1/species', { method: 'POST', body: row });
    assert.equal(asAnon.status, 401);
    assert.equal(asAnon.body.code, '42501');

    const { access_token: token } = await sessionFor(botanist);
    const added = await call('/rest/v1/species', { method: 'POST', token, body: row });
    assert.equal(added.status, 403);
    assert.equal(added.body.code, '42501');
    assert.equal(await speciesInDb(row.id), null);

    // Row Level Security hides the species from a botanist, so editing or deleting it does nothing
    const { summary } = await speciesInDb('standinia-exacta');
    const path = '/rest/v1/species?id=eq.standinia-exacta&select=id';
    const headers = representation;
    const edited = await call(path, { method: 'PATCH', token, body: { summary: 'No.' }, headers });
    assert.deepEqual([edited.status, edited.body], [200, []]);
    const deleted = await call(path, { method: 'DELETE', token, headers });
    assert.deepEqual([deleted.status, deleted.body], [200, []]);
    assert.equal((await speciesInDb('standinia-exacta')).summary, summary);
  });

  test('a change or delete without a filter is turned down, like on Supabase', async () => {
    const { access_token: token } = await sessionFor(officer);
    const count = async () =>
      (await standIn.db.query('SELECT count(*)::int AS n FROM public.species')).rows[0].n;
    const speciesCount = await count();

    const edited = await call('/rest/v1/species', {
      method: 'PATCH',
      token,
      body: { summary: 'Every species.' },
    });
    assert.equal(edited.status, 400);
    assert.equal(edited.body.code, '21000');
    const deleted = await call('/rest/v1/species', { method: 'DELETE', token });
    assert.equal(deleted.status, 400);
    assert.equal(deleted.body.code, '21000');

    assert.equal(await count(), speciesCount);
    const { rows } = await standIn.db.query(
      "SELECT id FROM public.species WHERE summary = 'Every species.'",
    );
    assert.deepEqual(rows, []);
  });
});

describe('requests the stand-in turns down', () => {
  test("a table or column that isn't there gives the REST API's errors", async () => {
    const table = await call('/rest/v1/plants?select=*');
    assert.equal(table.status, 404);
    assert.equal(table.body.code, 'PGRST205');

    for (const query of ['select=notes', 'recorded_by=eq.Stand-in', 'order=notes.desc']) {
      const { status, body } = await call(`/rest/v1/records_public?${query}`);
      assert.equal(status, 400, query);
      assert.equal(body.code, '42703', query);
    }

    const { access_token: token } = await sessionFor(officer);
    const body = websiteRow({ colour: 'green' });
    const unknown = await call('/rest/v1/species', { method: 'POST', token, body });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.code, 'PGRST204');
    assert.equal(await speciesInDb(body.id), null);
  });

  test('SQL in a column name is turned down before it gets to the database', async () => {
    const queries = [
      `select=${encodeURIComponent('id,(select 1)')}`,
      `select=${encodeURIComponent('id",gps')}`,
      `order=${encodeURIComponent('id;drop table species')}`,
      `${encodeURIComponent('id;drop table species')}=eq.1`,
    ];
    for (const query of queries) {
      const { status, body } = await call(`/rest/v1/records_public?${query}`);
      assert.equal(status, 400, query);
      assert.equal(body.code, '42703', query);
    }
  });

  test('a filter value is only ever a value', async () => {
    const value = encodeURIComponent("x' OR 'a'='a");
    const { status, body } = await call(`/rest/v1/species_public?select=id&id=eq.${value}`);
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  test("filters it doesn't know are turned down, even toString and constructor", async () => {
    const queries = [
      'id=toString.x',
      'id=constructor.x',
      'id=__proto__.x',
      'id=eq',
      'id=is.maybe',
      'id=in.',
      'or=(id.eq.x)',
      'order=id.sideways',
      'order=id.toString',
      'limit=-1',
      'offset=1.5',
    ];
    for (const query of queries) {
      const { status, body } = await call(`/rest/v1/records_public?${query}`);
      assert.equal(status, 400, query);
      assert.equal(body.code, 'PGRST100', query);
    }
  });

  test("a body that isn't JSON, or isn't rows, is turned down", async () => {
    const { access_token: token } = await sessionFor(officer);
    const notJson = await call('/rest/v1/species', { method: 'POST', token, body: '{not json' });
    assert.equal(notJson.status, 400);
    assert.equal(notJson.body.message, 'The body isn’t JSON');

    const bodies = [
      ['POST', []],
      ['POST', {}],
      ['POST', [1]],
      ['POST', 'null'],
      ['PATCH', [{ summary: 'One.' }, { summary: 'Two.' }]],
    ];
    for (const [method, body] of bodies) {
      const filter = method === 'PATCH' ? '?id=eq.standinia-exacta' : '';
      const response = await call(`/rest/v1/species${filter}`, { method, token, body });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.code, 'PGRST102', JSON.stringify(body));
    }
  });

  test('upserts, filters on an insert and other methods are turned down', async () => {
    const { access_token: token } = await sessionFor(officer);
    const row = websiteRow();
    const cases = [
      ['POST', '/rest/v1/species', { Prefer: 'resolution=merge-duplicates' }, 400, 'PGRST100'],
      ['POST', `/rest/v1/species?id=eq.${row.id}`, {}, 400, 'PGRST100'],
      ['DELETE', `/rest/v1/species?id=eq.${row.id}&order=id`, {}, 400, 'PGRST100'],
      ['PUT', `/rest/v1/species?id=eq.${row.id}`, {}, 405, 'PGRST117'],
    ];
    for (const [method, path, headers, status, code] of cases) {
      const body = method === 'DELETE' ? undefined : row;
      const response = await call(path, { method, token, body, headers });
      assert.equal(response.status, status, `${method} ${path}`);
      assert.equal(response.body.code, code, `${method} ${path}`);
    }
    assert.equal(await speciesInDb(row.id), null);
  });

  test("parts of Supabase the stand-in doesn't have say so", async () => {
    const storage = await call('/storage/v1/object/move', { method: 'POST', body: {} });
    assert.equal(storage.status, 404);
    assert.equal((await call('/storage/v1/bucket')).status, 404);
    const settings = await call('/auth/v1/settings');
    assert.equal(settings.status, 404);
    assert.equal(settings.body.error_code, 'not_found');
  });

  test('a body over 1 MB is turned down, and the stand-in carries on', async () => {
    const { access_token: token } = await sessionFor(officer);
    const body = websiteRow({ about: 'a'.repeat(1_100_000) });
    const big = await call('/rest/v1/species', { method: 'POST', token, body });
    assert.equal(big.status, 413);
    assert.equal(await speciesInDb(body.id), null);
    assert.equal((await call('/rest/v1/records_public?select=id&limit=1')).status, 200);
  });
});

describe('photos in Storage', () => {
  // The start of a JPEG file. The stand-in only keeps the bytes, so it doesn't need a whole photo
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff]);
  const photoPath = () => `species/eusideroxylon-zwageri/${randomUUID()}.jpg`;

  /** Uploads a file the way storage.from(bucket).upload(path, bytes) does with a Buffer. */
  async function upload(path, options = {}) {
    const { token = ANON_KEY, bytes = jpeg, type = 'image/jpeg', bucket = 'botanical-photos' } =
      options;
    const response = await fetch(`${standIn.url}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': type,
        'cache-control': 'max-age=3600',
        'x-upsert': options.upsert ? 'true' : 'false',
      },
      body: bytes,
    });
    return { status: response.status, body: await response.json() };
  }

  /** Deletes files the way storage.from(bucket).remove(paths) does. */
  function remove(paths, token = ANON_KEY) {
    return call('/storage/v1/object/botanical-photos', {
      method: 'DELETE',
      token,
      body: { prefixes: paths },
    });
  }

  /** Opens a public photo link like an <img> on a page, with no apikey. */
  function openLink(path, method = 'GET') {
    return fetch(`${standIn.url}/storage/v1/object/public/botanical-photos/${path}`, { method });
  }

  test('an officer uploads a photo and anyone can open its public link', async () => {
    const { access_token: token } = await sessionFor(officer);
    const path = photoPath();
    const uploaded = await upload(path, { token });
    assert.equal(uploaded.status, 200);
    assert.equal(uploaded.body.Key, `botanical-photos/${path}`);
    assert.match(uploaded.body.Id, /^[0-9a-f-]{36}$/);

    const link = await openLink(path);
    assert.equal(link.status, 200);
    assert.equal(link.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await link.arrayBuffer()), jpeg);
    const head = await openLink(path, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(jpeg.length));

    const { rows } = await standIn.db.query(
      "SELECT owner FROM storage.objects WHERE bucket_id = 'botanical-photos' AND name = $1",
      [path],
    );
    assert.deepEqual(rows, [{ owner: officer.id }]);
  });

  test('an admin can upload too, and everyone else is turned down', async () => {
    const { access_token: adminToken } = await sessionFor(admin);
    assert.equal((await upload(photoPath(), { token: adminToken })).status, 200);

    const tokens = [ANON_KEY];
    for (const user of [botanist, researcher, visitor, noProfile]) {
      tokens.push((await sessionFor(user)).access_token);
    }
    for (const token of tokens) {
      const path = photoPath();
      const refused = await upload(path, { token });
      assert.equal(refused.status, 403);
      assert.equal(refused.body.error, 'Unauthorized');
      assert.equal((await openLink(path)).status, 404);
    }
  });

  test('uploads Supabase would turn down are turned down', async () => {
    const { access_token: token } = await sessionFor(officer);
    const path = photoPath();
    assert.equal((await upload(path, { token })).status, 200);

    const again = await upload(path, { token });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'Duplicate');
    assert.equal((await upload(path, { token, upsert: true })).status, 400);

    const pdf = await upload(photoPath(), { token, type: 'application/pdf' });
    assert.equal(pdf.status, 415);
    const tooBig = await upload(photoPath(), { token, bytes: Buffer.alloc(10 * 1024 * 1024 + 1) });
    assert.equal(tooBig.status, 413);
    const form = await upload(photoPath(), { token, type: 'multipart/form-data; boundary=x' });
    assert.equal(form.status, 400);

    const nowhere = await upload(photoPath(), { token, bucket: 'no-such-bucket' });
    assert.equal(nowhere.status, 404);
    // URLs tidy away a plain .. before it's sent, so these are the ways one can still get through
    for (const badPath of ['species//a.jpg', 'species/%2E%2E%2Fsecret.jpg', 'species/a%20b.jpg']) {
      assert.equal((await upload(badPath, { token })).status, 404, badPath);
    }
    const expired = await upload(photoPath(), { token: 'not-a-token' });
    assert.equal(expired.status, 401);
    // The stand-in carries on after all of that
    assert.equal((await openLink(path)).status, 200);
  });

  test('only officers and admins can delete photos, and the link stops working', async () => {
    const { access_token: token } = await sessionFor(officer);
    const path = photoPath();
    await upload(path, { token });

    const { access_token: botanistToken } = await sessionFor(botanist);
    const notTheirs = await remove([path], botanistToken);
    assert.equal(notTheirs.status, 200);
    assert.deepEqual(notTheirs.body, []);
    assert.equal((await remove([path])).body.length, 0);
    assert.equal((await openLink(path)).status, 200);

    const { access_token: adminToken } = await sessionFor(admin);
    const removed = await remove([path, photoPath()], adminToken);
    assert.equal(removed.status, 200);
    assert.deepEqual(
      removed.body.map((file) => [file.bucket_id, file.name]),
      [['botanical-photos', path]],
    );
    const gone = await openLink(path);
    assert.equal(gone.status, 404);
    assert.equal((await gone.json()).error, 'not_found');
    assert.equal((await remove('not a list', token)).status, 400);
  });

  test('record photos stay private', async () => {
    const { access_token: token, user } = await sessionFor(botanist);
    const path = `${user.id}/${randomUUID()}/1.jpg`;
    const uploaded = await upload(path, { token, bucket: 'record-photos' });
    assert.equal(uploaded.status, 200);
    const link = await fetch(`${standIn.url}/storage/v1/object/public/record-photos/${path}`);
    assert.equal(link.status, 404);
  });

  /** A record with two photos, uploaded by the botanist the way the phone will (item 11). */
  async function recordWithPhotos() {
    const { access_token: token, user } = await sessionFor(botanist);
    const folder = `${user.id}/${randomUUID()}`;
    for (const name of ['2.jpg', '1.jpg']) {
      await upload(`${folder}/${name}`, { token, bucket: 'record-photos' });
    }
    return folder;
  }

  /** Lists a folder the way storage.from(bucket).list(folder) does. */
  function list(folder, token, bucket = 'record-photos') {
    return call(`/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      token,
      body: { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' }, prefix: folder },
    });
  }

  /** Asks for links the way storage.from(bucket).createSignedUrls(paths, seconds) does. */
  function sign(paths, token, expiresIn = 3600) {
    return call('/storage/v1/object/sign/record-photos', {
      method: 'POST',
      token,
      body: { expiresIn, paths },
    });
  }

  test("officers list a record's photos, and nobody else sees them", async () => {
    const folder = await recordWithPhotos();
    const { access_token: token } = await sessionFor(officer);
    const listed = await list(folder, token);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.map((file) => file.name), ['1.jpg', '2.jpg']);
    assert.ok(listed.body.every((file) => file.id && file.metadata.size === jpeg.length));

    // One level up, the record is a folder
    const [botanistId] = folder.split('/');
    const folders = await list(botanistId, token);
    assert.ok(folders.body.some((entry) => entry.name === folder.split('/')[1] && !entry.id));

    for (const user of [visitor, researcher]) {
      const { access_token: theirs } = await sessionFor(user);
      assert.deepEqual((await list(folder, theirs)).body, [], user.email);
    }
    assert.deepEqual((await list(folder)).body, []);
  });

  test('signed links open a record photo without signing in, until they run out', async () => {
    const folder = await recordWithPhotos();
    const { access_token: token } = await sessionFor(officer);
    const missing = `${folder}/3.jpg`;
    const signed = await sign([`${folder}/1.jpg`, missing], token, 60);
    assert.equal(signed.status, 200);
    assert.equal(signed.body[0].error, null);
    assert.match(signed.body[0].signedURL, /^\/object\/sign\/record-photos\/.+\?token=/);
    assert.equal(signed.body[1].path, missing);
    assert.equal(signed.body[1].signedURL, null);
    assert.ok(signed.body[1].error);

    // Like an <img>, with no apikey
    const link = await fetch(`${standIn.url}/storage/v1${signed.body[0].signedURL}`);
    assert.equal(link.status, 200);
    assert.deepEqual(Buffer.from(await link.arrayBuffer()), jpeg);

    // The token only works for the file it was made for
    const otherFile = signed.body[0].signedURL.replace('/1.jpg?', '/2.jpg?');
    assert.equal((await fetch(`${standIn.url}/storage/v1${otherFile}`)).status, 400);
    const changed = signed.body[0].signedURL.replace(/token=(\d+)/, (_, s) => `token=${+s + 999}`);
    assert.equal((await fetch(`${standIn.url}/storage/v1${changed}`)).status, 400);

    // A visitor can't get links to them
    const { access_token: visitorToken } = await sessionFor(visitor);
    const turnedDown = await sign([`${folder}/1.jpg`], visitorToken);
    assert.equal(turnedDown.body[0].signedURL, null);
    assert.equal((await sign('not a list', token)).status, 400);
    assert.equal((await sign([`${folder}/1.jpg`], token, 0)).status, 400);
  });

  test('officers delete record photos and the links stop working', async () => {
    const folder = await recordWithPhotos();
    const paths = [`${folder}/1.jpg`, `${folder}/2.jpg`];
    const { access_token: token } = await sessionFor(officer);
    const [{ signedURL }] = (await sign(paths, token)).body;

    const removeRecordPhotos = (who) =>
      call('/storage/v1/object/record-photos', {
        method: 'DELETE',
        token: who,
        body: { prefixes: paths },
      });
    const { access_token: botanistToken } = await sessionFor(botanist);
    assert.deepEqual((await removeRecordPhotos(botanistToken)).body, []);

    const removed = await removeRecordPhotos(token);
    assert.equal(removed.body.length, 2);
    assert.deepEqual((await list(folder, token)).body, []);
    assert.equal((await fetch(`${standIn.url}/storage/v1${signedURL}`)).status, 404);
  });
});

describe('answering like the REST API', () => {
  test(".single() gives one object, and a 406 when there isn't exactly one row", async () => {
    const one = await call(`/rest/v1/records_public?select=id&id=eq.${exactRecord}`, {
      headers: oneObject,
    });
    assert.equal(one.status, 200);
    assert.deepEqual(one.body, { id: exactRecord });

    const none = await call(`/rest/v1/records_public?select=id&id=eq.${waitingRecord}`, {
      headers: oneObject,
    });
    assert.equal(none.status, 406);
    assert.equal(none.body.code, 'PGRST116');
    assert.equal(none.body.details, 'The result contains 0 rows');
  });

  test('a change that should give one row but gives more is undone', async () => {
    const { access_token: token } = await sessionFor(officer);
    const { rows } = await standIn.db.query(
      "SELECT count(*)::int AS n FROM public.species WHERE iucn_code = 'VU'",
    );
    assert.ok(rows[0].n > 1);

    const changed = await call('/rest/v1/species?iucn_code=eq.VU&select=id', {
      method: 'PATCH',
      token,
      body: { summary: 'Should be undone.' },
      headers: { ...oneObject, ...representation },
    });
    assert.equal(changed.status, 406);
    assert.equal(changed.body.details, `The result contains ${rows[0].n} rows`);
    const undone = await standIn.db.query(
      "SELECT id FROM public.species WHERE summary = 'Should be undone.'",
    );
    assert.deepEqual(undone.rows, []);
  });

  test('count=exact puts the total in Content-Range, for a page and a HEAD request', async () => {
    const counted = { Prefer: 'count=exact' };
    const query = 'select=id&order=recorded_at.desc&limit=2&offset=1';
    const page = await call(`/rest/v1/records_public?${query}`, { headers: counted });
    assert.equal(page.status, 200);
    assert.equal(page.body.length, 2);
    assert.equal(page.headers.get('content-range'), '1-2/8');

    const uncounted = await call('/rest/v1/records_public?select=id');
    assert.equal(uncounted.headers.get('content-range'), '0-7/*');

    const none = await call(`/rest/v1/records_public?select=id&id=eq.${waitingRecord}`, {
      headers: counted,
    });
    assert.equal(none.headers.get('content-range'), '*/0');

    const { access_token: token } = await sessionFor(officer);
    const head = await call('/rest/v1/records_staff?select=id&species_slug=eq.standinia-exacta', {
      method: 'HEAD',
      token,
      headers: counted,
    });
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.equal(head.headers.get('content-range'), '0-1/2');
  });

  test('requests at the same time each run as their own user', async () => {
    const { access_token: token } = await sessionFor(officer);
    const answers = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        call('/rest/v1/records_staff?select=id', i % 2 ? { token } : {}),
      ),
    );
    answers.forEach((answer, i) => {
      if (i % 2) {
        assert.equal(answer.status, 200);
        assert.equal(answer.body.length, 10);
      } else {
        assert.equal(answer.status, 401);
        assert.equal(answer.body.code, '42501');
      }
    });
  });

  test('a letter split between two parts of a body comes through whole', async () => {
    const { access_token: token } = await sessionFor(officer);
    const row = websiteRow({ summary: 'It’s a plant for the tests.' });
    const bytes = Buffer.from(JSON.stringify(row));
    // ’ is three bytes, and the body is cut after the first one
    const cut = bytes.indexOf(Buffer.from('’')) + 1;

    const status = await new Promise((resolve, reject) => {
      const headers = {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const req = request(`${standIn.url}/rest/v1/species`, { method: 'POST', headers }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.write(bytes.subarray(0, cut));
      setTimeout(() => req.end(bytes.subarray(cut)), 50);
    });
    assert.equal(status, 201);
    assert.equal((await speciesInDb(row.id)).summary, 'It’s a plant for the tests.');
    await standIn.db.query('DELETE FROM public.species WHERE id = $1', [row.id]);
  });
});

describe('a sign in that has run out', () => {
  let shortLived;

  before(async () => {
    shortLived = await startStandIn({ port: 0, tokenSeconds: 0, log: () => {} });
  });

  after(() => shortLived.close());

  test('the REST API and Auth both turn down the JWT, and refreshing still works', async () => {
    const session = await sessionFor(officer, shortLived.url);
    assert.equal(session.expires_in, 0);
    const token = session.access_token;

    const rows = await callAt(shortLived.url, '/rest/v1/records_staff?select=id', { token });
    assert.equal(rows.status, 401);
    assert.equal(rows.body.code, 'PGRST303');

    const user = await callAt(shortLived.url, '/auth/v1/user', { token });
    assert.equal(user.status, 403);
    assert.equal(user.body.error_code, 'bad_jwt');
    assert.match(user.body.msg, /token has expired/);

    assert.equal((await refresh(session.refresh_token, shortLived.url)).status, 200);
  });

  test("a JWT from another run of the stand-in doesn't work", async () => {
    const { access_token: token } = await sessionFor(officer);
    const user = await callAt(shortLived.url, '/auth/v1/user', { token });
    assert.equal(user.status, 403);
    assert.equal(user.body.error_code, 'bad_jwt');

    const rows = await callAt(shortLived.url, '/rest/v1/records_staff?select=id', { token });
    assert.equal(rows.status, 401);
    assert.equal(rows.body.code, 'PGRST301');
  });
});

describe('a stand-in that sends a few rows at a time', () => {
  let capped;

  before(async () => {
    capped = await startStandIn({ port: 0, maxRows: 3, log: () => {} });
  });

  after(() => capped.close());

  test('a read gets maxRows rows at most, and offset and the count still work', async () => {
    const { access_token: token } = await sessionFor(officer, capped.url);
    const counted = { token, headers: { Prefer: 'count=exact' } };
    const query = '/rest/v1/records_staff?select=id&order=recorded_at.desc,id';

    const first = await callAt(capped.url, query, counted);
    assert.equal(first.status, 200);
    assert.equal(first.body.length, 3);
    assert.equal(first.headers.get('content-range'), '0-2/10');

    // Asking for more than maxRows still gets maxRows, like Max rows on Supabase
    const asked = await callAt(capped.url, `${query}&limit=999`, counted);
    assert.equal(asked.body.length, 3);

    const seen = [];
    for (let from = 0; from < 10; from += 3) {
      const page = await callAt(capped.url, `${query}&limit=3&offset=${from}`, counted);
      seen.push(...page.body.map((row) => row.id));
    }
    assert.equal(new Set(seen).size, 10);
    assert.deepEqual(seen.slice(0, 3), first.body.map((row) => row.id));
  });
});

describe('inviting and deactivating through Supabase Auth', () => {
  const service = { apikey: SERVICE_KEY, token: SERVICE_KEY };
  const welcome = 'http://127.0.0.1:3210/welcome';

  const invite = (email, name = 'New Person') =>
    call(`/auth/v1/invite?redirect_to=${encodeURIComponent(welcome)}`, {
      method: 'POST',
      ...service,
      body: { email, data: { name } },
    });

  /** Follows the link in the last email, like clicking it, and gives what's after the # */
  async function followLastEmail() {
    const response = await fetch(standIn.emails.at(-1).link, { redirect: 'manual' });
    assert.equal(response.status, 303);
    const back = new URL(response.headers.get('location'));
    assert.equal(back.origin + back.pathname, welcome);
    return new URLSearchParams(back.hash.slice(1));
  }

  async function profileOf(id) {
    const { rows } = await standIn.db.query('SELECT name, role FROM public.profiles WHERE id = $1', [
      id,
    ]);
    return rows[0];
  }

  test('only the service key can invite or list accounts', async () => {
    const asAnon = await call('/auth/v1/invite', { method: 'POST', body: { email: 'a@example.test' } });
    assert.equal(asAnon.status, 403);
    assert.equal(asAnon.body.error_code, 'not_admin');
    // Being an administrator in profiles doesn't count, only the key does
    const adminToken = (await signIn(admin.email)).body.access_token;
    const asAdmin = await call('/auth/v1/admin/users', { token: adminToken });
    assert.equal(asAdmin.status, 403);
    const list = await call('/auth/v1/admin/users', service);
    assert.equal(list.status, 200);
    assert.ok(list.body.users.some((u) => u.email === admin.email));
  });

  test('the service key doesn’t work for rows or files', async () => {
    const rows = await call('/rest/v1/profiles?select=id', service);
    assert.equal(rows.status, 403);
    const files = await call('/storage/v1/bucket/record-photos', service);
    assert.equal(files.status, 403);
  });

  test('an invite makes a visitor, and its link lets them set a password once', async () => {
    const { status, body: user } = await invite('Invited.One@example.test');
    assert.equal(status, 200);
    assert.equal(user.email, 'invited.one@example.test');
    assert.equal(user.email_confirmed_at, undefined);
    assert.deepEqual(await profileOf(user.id), { name: 'New Person', role: 'visitor' });

    const firstLink = standIn.emails.at(-1).link;
    const session = await followLastEmail();
    assert.equal(session.get('type'), 'invite');

    const newPassword = 'a brand new one';
    const set = await call('/auth/v1/user', {
      method: 'PUT',
      token: session.get('access_token'),
      body: { password: newPassword },
    });
    assert.equal(set.status, 200);
    assert.ok(set.body.email_confirmed_at);

    const again = await call('/auth/v1/user', {
      method: 'PUT',
      token: session.get('access_token'),
      body: { password: newPassword },
    });
    assert.equal(again.body.error_code, 'same_password');

    const signedIn = await call('/auth/v1/token?grant_type=password', {
      method: 'POST',
      token: null,
      body: { email: user.email, password: newPassword },
    });
    assert.equal(signedIn.status, 200);

    // The link only works once, and the account can't be invited again now it's finished
    standIn.emails.push({ link: firstLink });
    const used = await followLastEmail();
    assert.equal(used.get('error_code'), 'otp_expired');
    assert.equal((await invite(user.email)).body.error_code, 'email_exists');
  });

  test('inviting someone again sends a new link and stops the old one', async () => {
    await invite('invited.two@example.test');
    const old = standIn.emails.at(-1).link;
    const again = await invite('invited.two@example.test');
    assert.equal(again.status, 200);
    assert.notEqual(standIn.emails.at(-1).link, old);
    standIn.emails.push({ link: old });
    assert.equal((await followLastEmail()).get('error_code'), 'otp_expired');
  });

  test('a test account can’t be invited, and has no password to set', async () => {
    assert.equal((await invite(botanist.email)).body.error_code, 'email_exists');
    const token = (await signIn(botanist.email)).body.access_token;
    const set = await call('/auth/v1/user', {
      method: 'PUT',
      token,
      body: { password: 'something longer' },
    });
    assert.equal(set.status, 422);
  });

  test('a short new password is refused', async () => {
    await invite('invited.three@example.test');
    const session = await followLastEmail();
    const set = await call('/auth/v1/user', {
      method: 'PUT',
      token: session.get('access_token'),
      body: { password: 'short' },
    });
    assert.equal(set.body.error_code, 'weak_password');
  });

  test('a recovery link works like an invite, and says nothing about unknown emails', async () => {
    const before = standIn.emails.length;
    const unknown = await call(`/auth/v1/recover?redirect_to=${encodeURIComponent(welcome)}`, {
      method: 'POST',
      body: { email: 'nobody@example.test' },
    });
    assert.equal(unknown.status, 200);
    assert.equal(standIn.emails.length, before);

    await call(`/auth/v1/recover?redirect_to=${encodeURIComponent(welcome)}`, {
      method: 'POST',
      body: { email: 'invited.one@example.test' },
    });
    assert.equal((await followLastEmail()).get('type'), 'recovery');
  });

  test('a ban stops signing in and refreshing until it’s taken off', async () => {
    const { rows } = await standIn.db.query(
      `SELECT id FROM auth.users WHERE email = '${researcher.email}'`,
    );
    const { id } = rows[0];
    const first = await signIn(researcher.email);
    assert.equal(first.status, 200);

    const asBan = (duration, options = service) =>
      call(`/auth/v1/admin/users/${id}`, {
        method: 'PUT',
        ...options,
        body: { ban_duration: duration },
      });
    assert.equal((await asBan('876000h', { token: first.body.access_token })).status, 403);
    const banned = await asBan('876000h');
    assert.equal(banned.status, 200);
    assert.ok(banned.body.banned_until);

    assert.equal((await signIn(researcher.email)).body.error_code, 'user_banned');
    const refreshed = await call('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      token: null,
      body: { refresh_token: first.body.refresh_token },
    });
    assert.equal(refreshed.body.error_code, 'user_banned');
    // A JWT already given out keeps working until it runs out, like on Supabase
    assert.equal((await call('/auth/v1/user', { token: first.body.access_token })).status, 200);

    assert.equal((await asBan('none')).body.banned_until, undefined);
    assert.equal((await signIn(researcher.email)).status, 200);
  });
});

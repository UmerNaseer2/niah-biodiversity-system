// A stand-in for our Supabase project that runs on this computer, so the website's sign in and
// staff pages can be tried without a real project or real accounts. It builds the same PGlite
// database as the tests (our SQL files in order), adds test accounts and a few made-up records,
// and answers the parts of the Supabase API the website uses: password sign in, refreshing and
// signing out (Auth), and reading and changing rows (the REST API). Every request runs as the
// anon or authenticated role with the user's ID in the JWT claims, like the real API, so Row
// Level Security, the grants and the views from our SQL files decide what comes back.
//
// Everything is in memory, so stopping it throws it all away. Never put real data in it.
// web/README.md says how to run the website against it.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { asUser, newDatabase } from './harness.js';

/** The anon key the website uses with the stand-in. It only works here. */
export const ANON_KEY = 'stand-in-anon-key';

/** Every test account uses this password. It only works on the stand-in. */
export const TEST_PASSWORD = 'niah-stand-in';

function testUser(n, login, name, role) {
  const id = `00000000-0000-4000-8000-00000000000${n}`;
  return { id, email: `${login}@example.test`, name, role };
}

/** One test account for each role. The account with no role has its profile row taken out. */
export const TEST_USERS = [
  testUser(1, 'officer', 'Aina Officer', 'conservation_officer'),
  testUser(2, 'admin', 'Badrul Admin', 'admin'),
  testUser(3, 'botanist', 'Chong Botanist', 'botanist'),
  testUser(4, 'researcher', 'Dayang Researcher', 'researcher'),
  testUser(5, 'visitor', 'Elan Visitor', 'visitor'),
  testUser(6, 'noprofile', 'No Profile', null),
];

// Made up for the stand-in, on top of the sample data from 002. The sample species are all
// threatened or protected, so this one is Least Concern and not protected, to show a plant whose
// exact spot is public. The records cover the cases the website has to handle: a species the
// table doesn't have, no height, a dead plant, and records waiting for review or rejected. The
// points are made up near park HQ, like every other sample point.
const TEST_SPECIES = {
  id: 'standinia-exacta',
  slug: 'standinia-exacta',
  scientific_name: 'Standinia exacta',
  family: 'Standiniaceae',
  common_names: ['Stand-in tree'],
  iucn_code: 'LC',
  sarawak_protected: false,
  summary:
    'Made up for the stand-in. It’s Least Concern and not protected, so its plants show their ' +
    'exact spot.',
};

const TEST_RECORDS = [
  {
    id: 'd00d0100-0000-4000-8000-000000000001',
    species_slug: 'standinia-exacta',
    species_name: 'Standinia exacta',
    common_name: 'Stand-in tree',
    height_m: 4.2,
    condition: 'healthy',
    gps: { lat: 3.8152, lng: 113.7791, accuracyM: 5 },
    recorded_at: '2026-10-10T09:15:00Z',
    status: 'published',
  },
  {
    id: 'd00d0200-0000-4000-8000-000000000002',
    species_slug: null,
    species_name: 'Ficus sp.',
    common_name: 'Strangler fig',
    height_m: null,
    condition: 'dead',
    gps: { lat: 3.8133, lng: 113.7802, accuracyM: 8 },
    recorded_at: '2026-10-11T10:30:00Z',
    status: 'published',
  },
  {
    id: 'd00d0300-0000-4000-8000-000000000003',
    species_slug: 'koompassia-excelsa',
    species_name: 'Koompassia excelsa',
    common_name: 'Tapang',
    height_m: 31,
    condition: 'diseased',
    gps: { lat: 3.812, lng: 113.7811, accuracyM: 7 },
    recorded_at: '2026-10-12T08:05:00Z',
    status: 'waiting',
  },
  {
    id: 'd00d0400-0000-4000-8000-000000000004',
    species_slug: 'standinia-exacta',
    species_name: 'Standinia exacta',
    common_name: 'Stand-in tree',
    height_m: 2.5,
    condition: 'damaged',
    gps: { lat: 3.816, lng: 113.777, accuracyM: 15 },
    recorded_at: '2026-10-12T14:40:00Z',
    status: 'rejected',
    review_notes: 'The photos are too blurry to tell the species.',
  },
];

const IDENT = /^[a-z_][a-z0-9_]*$/;
// Maps, not plain objects, so a word like constructor or toString isn't a filter by accident
const FILTERS = new Map([
  ['eq', '='],
  ['neq', '<>'],
  ['gt', '>'],
  ['gte', '>='],
  ['lt', '<'],
  ['lte', '<='],
  ['like', 'LIKE'],
  ['ilike', 'ILIKE'],
]);
const ORDER_WORDS = new Map([
  ['asc', 'ASC'],
  ['desc', 'DESC'],
  ['nullsfirst', 'NULLS FIRST'],
  ['nullslast', 'NULLS LAST'],
]);
// The words in a REST query string that aren't filters
const NOT_FILTERS = new Set(['select', 'order', 'limit', 'offset', 'columns']);

/**
 * Starts the stand-in and gives back its URL and a close() for stopping it. Port 0 picks any free
 * port, which the tests use. tokenSeconds is how long a sign in lasts before the website has to
 * refresh it, an hour like Supabase unless it's made shorter to try refreshing.
 */
export async function startStandIn({
  host = '127.0.0.1',
  port = 54321,
  tokenSeconds = 3600,
  log = console.log,
} = {}) {
  const db = await newDatabase();
  await addTestData(db);

  // The API's schema cache: the columns of every table and view in public
  const columns = new Map();
  const { rows } = await db.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  );
  for (const row of rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name).add(row.column_name);
  }

  const auth = new Auth(tokenSeconds);
  // PGlite has one connection, so requests take turns
  let queue = Promise.resolve();
  const oneAtATime = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  const server = createServer((req, res) => {
    handle(req, res, { auth, columns, db, oneAtATime })
      .catch((error) => {
        console.error(error);
        if (!res.headersSent) send(res, 500, { message: 'The stand-in broke. See its terminal.' });
      })
      .finally(() => log(`${req.method} ${req.url.split('?')[0]} ${res.statusCode}`));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return {
    url: `http://${host}:${server.address().port}`,
    db,
    async close() {
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
      await db.close();
    },
  };
}

async function addTestData(db) {
  for (const user of TEST_USERS) {
    // Signs up the way Supabase Auth does, so the trigger from 004 makes a visitor profile
    await db.query('INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)', [
      user.id,
      user.email,
      JSON.stringify({ name: user.name }),
    ]);
    if (user.role === null) {
      await db.query('DELETE FROM public.profiles WHERE id = $1', [user.id]);
    } else if (user.role !== 'visitor') {
      await db.query('UPDATE public.profiles SET role = $1 WHERE id = $2', [user.role, user.id]);
    }
  }
  await db.query(
    `INSERT INTO public.species (id, slug, scientific_name, family, common_names, iucn_code,
       sarawak_protected, summary)
     SELECT id, slug, scientific_name, family, common_names, iucn_code, sarawak_protected, summary
     FROM json_populate_record(null::public.species, $1::json)`,
    [JSON.stringify(TEST_SPECIES)],
  );
  for (const record of TEST_RECORDS) {
    await db.query(
      `INSERT INTO public.records (id, species_slug, species_name, common_name, height_m,
         condition, gps, recorded_by, recorded_at, status, review_notes)
       SELECT id, species_slug, species_name, common_name, height_m, condition, gps,
         'Stand-in', recorded_at, status, review_notes
       FROM json_populate_record(null::public.records, $1::json)`,
      [JSON.stringify(record)],
    );
  }
}

async function handle(req, res, ctx) {
  // Lets a page in a browser call the stand-in too, like it can call Supabase
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
  if (req.method === 'OPTIONS') return send(res, 204);

  if (!req.headers.apikey) return send(res, 401, { message: 'No API key found in request' });
  if (req.headers.apikey !== ANON_KEY) return send(res, 401, { message: 'Invalid API key' });

  const { body, status, message } = await readBody(req);
  if (status) return send(res, status, { message });

  const url = new URL(req.url, 'http://stand-in');
  if (url.pathname.startsWith('/auth/v1/')) {
    return ctx.auth.handle(req, res, url.pathname.slice('/auth/v1'.length), url, body);
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    try {
      return await rest(req, res, url, body, ctx);
    } catch (error) {
      if (error instanceof Refusal) return send(res, error.status, error.body);
      throw error;
    }
  }
  return send(res, 404, { message: 'no Route matched with those values' });
}

/** Reads a JSON body. The body is null when there isn't one. */
async function readBody(req) {
  const chunks = [];
  let size = 0;
  // Reads to the end even when it's too big, so the answer still gets back on the same connection
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 1_000_000) chunks.push(chunk);
  }
  if (size > 1_000_000) return { status: 413, message: 'The body is over 1 MB' };
  // Joined as bytes first, so a character split between two chunks comes out whole
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return { body: null };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { status: 400, message: 'The body isn’t JSON' };
  }
}

function send(res, status, body, headers = {}) {
  if (body === undefined) {
    res.writeHead(status, headers);
    return res.end();
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function bearerOf(req) {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '');
  return match ? match[1] : null;
}

// ----- Auth -----

class Auth {
  constructor(tokenSeconds) {
    this.tokenSeconds = tokenSeconds;
    // A new secret each run, so a cookie from an earlier run is a bad JWT, like after a restart
    // with a new JWT secret on Supabase
    this.secret = randomBytes(32);
    // The sessions that are signed in, with their user's ID
    this.sessions = new Map();
    // Every refresh token given out, with its session, when it was used and the one after it
    this.refreshTokens = new Map();
  }

  handle(req, res, path, url, body) {
    const grant = url.searchParams.get('grant_type');
    if (req.method === 'POST' && path === '/token' && grant === 'password') {
      const user = findUser(body?.email, body?.password);
      if (!user) return authError(res, 400, 'invalid_credentials', 'Invalid login credentials');
      return send(res, 200, this.newSession(user));
    }
    if (req.method === 'POST' && path === '/token' && grant === 'refresh_token') {
      return this.refresh(res, body?.refresh_token);
    }
    if (req.method === 'GET' && path === '/user') {
      const checked = this.check(bearerOf(req));
      if (!checked.user) return authError(res, checked.status, checked.code, checked.error);
      return send(res, 200, userJson(checked.user));
    }
    if (req.method === 'POST' && path === '/logout') {
      const checked = this.check(bearerOf(req));
      if (!checked.user) return authError(res, checked.status, checked.code, checked.error);
      this.signOut(checked.claims, url.searchParams.get('scope') ?? 'global');
      return send(res, 204);
    }
    if (req.method === 'POST' && path === '/signup') {
      // Like our project with "Allow new users to sign up" turned off
      return authError(res, 422, 'signup_disabled', 'Signups not allowed for this instance');
    }
    return authError(res, 404, 'not_found', 'The stand-in doesn’t have this part of Supabase Auth');
  }

  newSession(user, sessionId = randomUUID(), refreshToken = null) {
    this.sessions.set(sessionId, user.id);
    if (!refreshToken) {
      refreshToken = randomBytes(12).toString('base64url');
      this.refreshTokens.set(refreshToken, { sessionId, usedAt: null, next: null });
    }
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      aud: 'authenticated',
      exp: now + this.tokenSeconds,
      iat: now,
      iss: 'stand-in',
      sub: user.id,
      email: user.email,
      phone: '',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { name: user.name },
      role: 'authenticated',
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: now }],
      session_id: sessionId,
      is_anonymous: false,
    };
    return {
      access_token: this.sign(claims),
      token_type: 'bearer',
      expires_in: this.tokenSeconds,
      expires_at: claims.exp,
      refresh_token: refreshToken,
      user: userJson(user),
    };
  }

  // A refresh token works once, like on Supabase. Using it again within 10 seconds gives the
  // token that came after it, because two requests can refresh at the same time. After that it
  // signs the whole session out, because someone else may have the token.
  refresh(res, token) {
    const found = this.refreshTokens.get(token);
    const userId = found && this.sessions.get(found.sessionId);
    if (!userId) {
      return authError(res, 400, 'refresh_token_not_found',
        'Invalid Refresh Token: Refresh Token Not Found');
    }
    const user = TEST_USERS.find((u) => u.id === userId);
    if (found.usedAt === null) {
      const session = this.newSession(user, found.sessionId);
      found.usedAt = Date.now();
      found.next = session.refresh_token;
      return send(res, 200, session);
    }
    if (Date.now() - found.usedAt <= 10_000) {
      return send(res, 200, this.newSession(user, found.sessionId, found.next));
    }
    this.sessions.delete(found.sessionId);
    return authError(res, 400, 'refresh_token_already_used', 'Invalid Refresh Token: Already Used');
  }

  signOut(claims, scope) {
    for (const [sessionId, userId] of this.sessions) {
      if (userId !== claims.sub) continue;
      const same = sessionId === claims.session_id;
      if (scope === 'global' || (scope === 'local' && same) || (scope === 'others' && !same)) {
        this.sessions.delete(sessionId);
      }
    }
  }

  sign(claims) {
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}`;
    return `${unsigned}.${createHmac('sha256', this.secret).update(unsigned).digest('base64url')}`;
  }

  /**
   * Checks a JWT the way Supabase Auth does. Gives its claims and user, or what's wrong with it.
   * A signed out session still gives the claims, because the REST API doesn't check sessions.
   */
  check(token) {
    if (!token) {
      return {
        status: 401,
        code: 'no_authorization',
        error: 'This endpoint requires a Bearer token',
      };
    }
    const bad = {
      status: 403,
      code: 'bad_jwt',
      error: 'invalid JWT: unable to parse or verify signature',
    };
    const parts = token.split('.');
    if (parts.length !== 3) return bad;
    const expected = createHmac('sha256', this.secret).update(`${parts[0]}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return bad;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (claims.exp * 1000 <= Date.now()) {
      const error = 'invalid JWT: unable to parse or verify signature, token has expired';
      return { ...bad, error, expired: true };
    }
    if (!this.sessions.has(claims.session_id)) {
      return {
        status: 403,
        code: 'session_not_found',
        error: 'Session from session_id claim in JWT does not exist',
        claims,
      };
    }
    const user = TEST_USERS.find((u) => u.id === claims.sub);
    return user ? { claims, user } : bad;
  }
}

function findUser(email, password) {
  // Capitals don't matter in an email, like on Supabase. The website takes out spaces itself.
  const user = TEST_USERS.find((u) => u.email === String(email ?? '').toLowerCase());
  const given = Buffer.from(String(password ?? ''));
  const wanted = Buffer.from(TEST_PASSWORD);
  const right = given.length === wanted.length && timingSafeEqual(given, wanted);
  return user && right ? user : null;
}

function userJson(user) {
  const at = '2026-10-01T00:00:00Z';
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: at,
    phone: '',
    confirmed_at: at,
    last_sign_in_at: at,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: user.name },
    identities: [],
    created_at: at,
    updated_at: at,
    is_anonymous: false,
  };
}

function authError(res, status, code, msg) {
  return send(res, status, { code: status, error_code: code, msg });
}

// ----- REST API -----

/** An error the REST API sends back, with its HTTP status. */
class Refusal extends Error {
  constructor(status, code, message, details = null, hint = null) {
    super(message);
    this.status = status;
    this.body = { code, details, hint, message };
  }
}

/** The HTTP status the REST API gives for a Postgres error code, from PostgREST's table. */
function statusFor(code, signedIn) {
  if (code === '42501') return signedIn ? 403 : 401;
  if (code === '23503' || code === '23505') return 409;
  if (code === '42P01' || code === '42883') return 404;
  if (code === '25006') return 405;
  if (code === 'P0001') return 400;
  const start = code.slice(0, 2);
  if (['08', '53'].includes(start)) return 503;
  if (start === '54') return 413;
  if (['0L', '0P', '28'].includes(start)) return 403;
  if (['09', '25', '2D', '38', '39', '3B', '40', '55', '57', '58'].includes(start)) return 500;
  if (['F0', 'HV', 'P0', 'XX'].includes(start)) return 500;
  return 400;
}

/** Who a REST request is from: null for the anon key, or the signed in user in the JWT. */
function whoIsAsking(req, auth) {
  const token = bearerOf(req);
  if (!token || token === ANON_KEY) return null;
  const checked = auth.check(token);
  // The REST API only checks the JWT itself, not the session, so a JWT still works after its
  // user signs out, until it runs out, like on Supabase
  if (checked.claims) return { id: checked.claims.sub };
  if (checked.expired) throw new Refusal(401, 'PGRST303', 'JWT expired');
  throw new Refusal(401, 'PGRST301', 'JWT could not be decoded');
}

function selectFrom(select, column) {
  if (!select || select === '*') return '*';
  return select
    .split(',')
    .map((name) => (name === '*' ? '*' : column(name)))
    .join(', ');
}

/** Turns filters like id=eq.123 into SQL, with their values as $1 style parameters. */
function whereFrom(searchParams, column, params) {
  const where = [];
  for (const [name, value] of searchParams) {
    if (NOT_FILTERS.has(name)) continue;
    if (name === 'or' || name === 'and') {
      throw new Refusal(400, 'PGRST100', 'The stand-in doesn’t do or() and and() filters');
    }
    const negate = value.startsWith('not.');
    const filter = negate ? value.slice('not.'.length) : value;
    const dot = filter.indexOf('.');
    const op = dot === -1 ? filter : filter.slice(0, dot);
    const arg = dot === -1 ? null : filter.slice(dot + 1);
    let sql;
    if (FILTERS.has(op) && arg !== null) {
      params.push(op.endsWith('like') ? arg.replaceAll('*', '%') : arg);
      sql = `${column(name)} ${FILTERS.get(op)} $${params.length}`;
    } else if (op === 'is' && ['null', 'true', 'false'].includes(arg)) {
      sql = `${column(name)} IS ${arg.toUpperCase()}`;
    } else if (op === 'in' && arg === '()') {
      column(name);
      sql = 'false';
    } else if (op === 'in' && /^\(.+\)$/.test(arg ?? '')) {
      const items = arg.slice(1, -1).split(',').map((item) => item.replace(/^"(.*)"$/, '$1'));
      sql = `${column(name)} IN (${items.map((item) => `$${params.push(item)}`).join(', ')})`;
    } else {
      throw new Refusal(400, 'PGRST100', `The stand-in doesn’t understand ${name}=${value}`);
    }
    where.push(negate ? `NOT (${sql})` : sql);
  }
  return where.length ? ` WHERE ${where.join(' AND ')}` : '';
}

/** Turns order=recorded_at.desc,name.asc.nullslast into SQL. */
function orderFrom(order, column) {
  if (!order) return '';
  const terms = order.split(',').map((term) => {
    const [name, ...words] = term.split('.');
    const sql = words.map((word) => {
      if (!ORDER_WORDS.has(word)) {
        throw new Refusal(400, 'PGRST100', `The stand-in doesn’t understand order=${order}`);
      }
      return ORDER_WORDS.get(word);
    });
    return [column(name), ...sql].join(' ');
  });
  return ` ORDER BY ${terms.join(', ')}`;
}

function pageFrom(searchParams) {
  let sql = '';
  for (const word of ['limit', 'offset']) {
    const value = searchParams.get(word);
    if (value === null) continue;
    if (!/^\d+$/.test(value)) {
      throw new Refusal(400, 'PGRST100', `${word} has to be a whole number`);
    }
    sql += ` ${word.toUpperCase()} ${value}`;
  }
  return sql;
}

/** The columns a POST or PATCH body sets, checked against the schema cache like the API does. */
function columnsToSet(method, body, table, known) {
  const rows = Array.isArray(body) ? body : [body];
  const isObject = (row) => row !== null && typeof row === 'object' && !Array.isArray(row);
  if (!rows.length || !rows.every(isObject)) {
    throw new Refusal(400, 'PGRST102', 'The body has to be a JSON object or a list of them');
  }
  if (method === 'PATCH' && rows.length !== 1) {
    throw new Refusal(400, 'PGRST102', 'An update takes one JSON object');
  }
  const names = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!names.length) throw new Refusal(400, 'PGRST102', 'The body doesn’t have any columns');
  for (const name of names) {
    if (!IDENT.test(name) || !known.has(name)) {
      throw new Refusal(400, 'PGRST204',
        `Could not find the '${name}' column of '${table}' in the schema cache`);
    }
  }
  return { names: names.map((name) => `"${name}"`).join(', '), json: JSON.stringify(rows) };
}

async function rest(req, res, url, body, { auth, columns, db, oneAtATime }) {
  // The API checks the JWT before anything else
  const user = whoIsAsking(req, auth);

  const table = url.pathname.slice('/rest/v1/'.length);
  if (!IDENT.test(table) || !columns.has(table)) {
    throw new Refusal(404, 'PGRST205',
      `Could not find the table 'public.${table}' in the schema cache`);
  }
  const known = columns.get(table);
  const column = (name) => {
    if (!IDENT.test(name) || !known.has(name)) {
      throw new Refusal(400, '42703', `column ${table}.${name} does not exist`);
    }
    return `"${name}"`;
  };

  const method = req.method;
  const reading = method === 'GET' || method === 'HEAD';
  const params = [];
  const selectSql = selectFrom(url.searchParams.get('select'), column);
  const whereSql = whereFrom(url.searchParams, column, params);
  const orderSql = orderFrom(url.searchParams.get('order'), column);
  const pageSql = pageFrom(url.searchParams);
  if (!reading && (orderSql || pageSql)) {
    throw new Refusal(400, 'PGRST100', 'The stand-in only takes order, limit and offset on reads');
  }

  const prefer = String(req.headers.prefer ?? '');
  if (prefer.includes('resolution=')) {
    throw new Refusal(400, 'PGRST100', 'The stand-in can’t upsert');
  }
  const wantsRows = prefer.includes('return=representation');
  const wantsCount = prefer.includes('count=exact');
  // .single() asks for one object instead of a list
  const oneObject = String(req.headers.accept ?? '').includes('application/vnd.pgrst.object+json');

  const target = `public."${table}"`;
  const returning = wantsRows ? ` RETURNING ${selectSql}` : '';
  let sql;
  if (reading) {
    sql = `SELECT ${selectSql} FROM ${target}${whereSql}${orderSql}${pageSql}`;
  } else if (method === 'POST') {
    if (whereSql) throw new Refusal(400, 'PGRST100', 'An insert doesn’t take filters');
    const set = columnsToSet(method, body, table, known);
    params.push(set.json);
    sql = `INSERT INTO ${target} (${set.names})
      SELECT ${set.names} FROM json_populate_recordset(null::${target}, $${params.length}::json)
      ${returning}`;
  } else if (method === 'PATCH' || method === 'DELETE') {
    // Supabase won't change or delete every row of a table by accident either
    const verb = method === 'PATCH' ? 'UPDATE' : 'DELETE';
    if (!whereSql) throw new Refusal(400, '21000', `${verb} requires a WHERE clause`);
    if (method === 'PATCH') {
      const set = columnsToSet(method, body, table, known);
      params.push(set.json);
      sql = `UPDATE ${target} SET (${set.names}) = (
        SELECT ${set.names} FROM json_populate_recordset(null::${target}, $${params.length}::json)
      )${whereSql}${returning}`;
    } else {
      sql = `DELETE FROM ${target}${whereSql}${returning}`;
    }
  } else {
    throw new Refusal(405, 'PGRST117', `Unsupported HTTP method: ${method}`);
  }

  let rows;
  let total = null;
  try {
    ({ rows, total } = await oneAtATime(() =>
      asUser(db, user, async (tx) => {
        const result = await tx.query(sql, params);
        if (oneObject && (reading || wantsRows) && result.rows.length !== 1) {
          // Thrown inside the transaction, so a change is undone, like the API does
          throw new Refusal(406, 'PGRST116', 'Cannot coerce the result to a single JSON object',
            `The result contains ${result.rows.length} rows`);
        }
        if (!wantsCount || !reading) return { rows: result.rows, total: null };
        const counted = await tx.query(
          `SELECT count(*)::int AS n FROM ${target}${whereSql}`,
          params,
        );
        return { rows: result.rows, total: counted.rows[0].n };
      }),
    ));
  } catch (error) {
    if (error instanceof Refusal || typeof error.code !== 'string') throw error;
    throw new Refusal(statusFor(error.code, user !== null), error.code, error.message,
      error.detail ?? null, error.hint ?? null);
  }

  const start = Number(url.searchParams.get('offset') ?? 0);
  const range = rows.length ? `${start}-${start + rows.length - 1}` : '*';
  const headers = { 'Content-Range': `${range}/${total ?? '*'}` };
  if (method === 'HEAD') return send(res, 200, undefined, headers);
  if (method === 'GET') return send(res, 200, oneObject ? rows[0] : rows, headers);
  const status = method === 'POST' ? 201 : wantsRows ? 200 : 204;
  if (!wantsRows) return send(res, status, undefined, headers);
  return send(res, status, oneObject ? rows[0] : rows, headers);
}

// `npm run stand-in` runs this. STAND_IN_PORT changes the port, and STAND_IN_TOKEN_SECONDS makes
// a sign in run out sooner, to try refreshing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.STAND_IN_PORT || 54321);
  const tokenSeconds = Number(process.env.STAND_IN_TOKEN_SECONDS || 3600);
  const portWorks = Number.isInteger(port) && port >= 0 && port <= 65535;
  if (!portWorks || !Number.isInteger(tokenSeconds) || tokenSeconds < 0) {
    console.error('STAND_IN_PORT and STAND_IN_TOKEN_SECONDS have to be whole numbers.');
    process.exit(1);
  }
  const standIn = await startStandIn({ port, tokenSeconds });
  console.log(`Supabase stand-in running on ${standIn.url}, with the anon key ${ANON_KEY}`);
  console.log('Test accounts (the password is TEST_PASSWORD in stand-in.js):');
  for (const user of TEST_USERS) console.log(`  ${user.email}  ${user.role ?? 'no profile'}`);
  console.log('Press Ctrl+C to stop it. Everything in it goes when it stops.');
}

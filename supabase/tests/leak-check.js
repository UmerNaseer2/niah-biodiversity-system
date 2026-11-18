// Looks for the exact spot of a hidden plant anywhere a signed out person can read.
//
// It adds made up plants whose spot must never be public: a Critically Endangered one, a protected
// one, one an officer set to rough area only, one whose name doesn't match its species, one with no
// species, one still waiting for review and one that was turned down. Each sits on its own made up
// point. Then it reads everything the anon key can read through the API (every table and view in
// public, every function, the photo buckets) and, with --web, every public page of the website,
// and looks for those points in what comes back.
//
// Nothing here is a real plant or a real spot. It is a lab check on the stand-in, not a field test.
//
// The API part runs in the database tests (leak.test.js). To check the website as well:
//
//   1. node leak-check.js --web http://127.0.0.1:3210
//      This starts the stand-in on port 54321 with the hidden plants and waits for the website.
//   2. Start the website against the stand-in (the web-stand-in launch setting).
//
// It prints every page and read it checked and stops with code 1 if it found a spot.
import { ANON_KEY, startStandIn } from './stand-in.js';

/** The hidden plants. The points are made up and far enough apart to tell them apart. */
export const HIDDEN_SPECIES = [
  {
    id: 'leakia-critica',
    scientific_name: 'Leakia critica',
    common_names: ['Lab tree, critical'],
    iucn_code: 'CR',
    sarawak_protected: false,
    rough_area_only: false,
  },
  {
    id: 'leakia-protecta',
    scientific_name: 'Leakia protecta',
    common_names: ['Lab tree, protected'],
    iucn_code: 'LC',
    sarawak_protected: true,
    rough_area_only: false,
  },
  {
    id: 'leakia-officer',
    scientific_name: 'Leakia officeri',
    common_names: ['Lab tree, rough area'],
    iucn_code: 'LC',
    sarawak_protected: false,
    rough_area_only: true,
  },
  {
    id: 'leakia-common',
    scientific_name: 'Leakia communis',
    common_names: ['Lab tree, common'],
    iucn_code: 'LC',
    sarawak_protected: false,
    rough_area_only: false,
  },
];

export const HIDDEN_RECORDS = [
  {
    why: 'Critically Endangered',
    id: 'ae1c0000-0000-4000-8000-000000000001',
    species_slug: 'leakia-critica',
    species_name: 'Leakia critica',
    status: 'published',
    gps: { lat: 3.809371, lng: 113.783159, accuracyM: 4 },
  },
  {
    why: 'Protected in Sarawak',
    id: 'ae2c0000-0000-4000-8000-000000000002',
    species_slug: 'leakia-protecta',
    species_name: 'Leakia protecta',
    status: 'published',
    gps: { lat: 3.817264, lng: 113.774813, accuracyM: 6 },
  },
  {
    why: 'Set to rough area by an officer',
    id: 'ae3c0000-0000-4000-8000-000000000003',
    species_slug: 'leakia-officer',
    species_name: 'Leakia officeri',
    status: 'published',
    gps: { lat: 3.806482, lng: 113.791537, accuracyM: 5 },
  },
  {
    why: 'Name does not match its species',
    id: 'ae4c0000-0000-4000-8000-000000000004',
    species_slug: 'leakia-common',
    species_name: 'Leakia critica',
    status: 'published',
    gps: { lat: 3.821943, lng: 113.786271, accuracyM: 5 },
  },
  {
    why: 'No species',
    id: 'ae5c0000-0000-4000-8000-000000000005',
    species_slug: null,
    species_name: 'Unknown seedling',
    status: 'published',
    gps: { lat: 3.803127, lng: 113.778694, accuracyM: 9 },
  },
  {
    why: 'Waiting for review',
    id: 'ae6c0000-0000-4000-8000-000000000006',
    species_slug: 'leakia-common',
    species_name: 'Leakia communis',
    status: 'waiting',
    gps: { lat: 3.824618, lng: 113.772359, accuracyM: 3 },
  },
  {
    why: 'Turned down',
    id: 'ae7c0000-0000-4000-8000-000000000007',
    species_slug: 'leakia-common',
    species_name: 'Leakia communis',
    status: 'rejected',
    gps: { lat: 3.800853, lng: 113.795428, accuracyM: 3 },
  },
];

/** The tag code the database makes from a record ID (005). */
export const tagOf = (id) => `NNP-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

/**
 * Every way a point could show up in a page or a reply: the number as stored, and cut or rounded
 * to 4 decimals (about 11 m). The rough area the public sees is a 0.004 degree square rounded to 3
 * decimals, so it never matches these.
 */
export function spotPatterns(gps) {
  const out = new Set();
  for (const n of [gps.lat, gps.lng]) {
    const text = String(n);
    out.add(text);
    out.add(text.slice(0, text.indexOf('.') + 5));
    out.add(n.toFixed(4));
  }
  return [...out];
}

/** Adds the hidden plants straight to the database, as the postgres user. */
export async function addHiddenPlants(db) {
  for (const s of HIDDEN_SPECIES) {
    await db.query(
      `INSERT INTO public.species (id, slug, scientific_name, family, common_names, iucn_code,
         sarawak_protected, rough_area_only, summary)
       VALUES ($1, $1, $2, 'Leakiaceae', $3, $4, $5, $6, 'Made up for the leak check.')`,
      [s.id, s.scientific_name, s.common_names, s.iucn_code, s.sarawak_protected, s.rough_area_only],
    );
  }
  for (const r of HIDDEN_RECORDS) {
    await db.query(
      `INSERT INTO public.records (id, species_slug, species_name, condition, gps, recorded_by,
         recorded_at, status, notes)
       VALUES ($1, $2, $3, 'healthy', $4, 'Leak check', '2026-11-01T02:00:00Z', $5,
         'Made up for the leak check.')`,
      [r.id, r.species_slug, r.species_name, r.gps, r.status],
    );
  }
}

/** Finds which hidden plants' points are in some text. */
export function spotsIn(text) {
  const found = [];
  for (const r of HIDDEN_RECORDS) {
    const hits = spotPatterns(r.gps).filter((p) => text.includes(p));
    if (hits.length > 0) found.push({ record: tagOf(r.id), why: r.why, hits });
  }
  return found;
}

/** The tables, views and functions in public, from the database itself. */
async function whatTheApiHas(db) {
  const tables = await db.query(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const functions = await db.query(
    `SELECT DISTINCT p.proname AS name FROM pg_proc AS p
     JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname`,
  );
  return { tables: tables.rows.map((r) => r.name), functions: functions.rows.map((r) => r.name) };
}

const signedOut = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };

/**
 * Reads everything the anon key can read and gives back one line per read: what was read, the
 * answer's status, its size and any hidden spots in it.
 */
export async function checkApi(url, db) {
  const { tables, functions } = await whatTheApiHas(db);
  const checked = [];
  const read = async (what, path, init = {}) => {
    const res = await fetch(`${url}${path}`, { ...init, headers: { ...signedOut, ...init.headers } });
    const body = await res.text();
    checked.push({ what, status: res.status, bytes: body.length, spots: spotsIn(body) });
  };
  for (const table of tables) await read(`table ${table}`, `/rest/v1/${table}?select=*`);
  for (const fn of functions) {
    await read(`function ${fn}`, `/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  }
  for (const bucket of ['record-photos', 'botanical-photos']) {
    await read(`files in ${bucket}`, `/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 1000 }),
    });
  }
  return checked;
}

const NOT_PAGES = /\.(?:png|jpe?g|webp|svg|ico|css|js|woff2?|txt|xml|json)(?:\?|$)/i;

/**
 * Opens every public page of the website signed out, starting from the home page, the species
 * pages and the hidden plants' tag pages, and following links on the same site. Staff pages are
 * read once without following them, to see they send a signed out person to sign in.
 */
export async function checkWebsite(site, { max = 400 } = {}) {
  const start = [
    '/',
    '/plants',
    '/welcome',
    '/screens',
    '/login',
    '/tag',
    '/health',
    '/robots.txt',
    '/sitemap.xml',
    ...HIDDEN_SPECIES.map((s) => `/plants/${s.id}`),
    ...HIDDEN_RECORDS.map((r) => `/tag/${tagOf(r.id)}`),
    ...HIDDEN_RECORDS.map((r) => `/tag?code=${tagOf(r.id)}`),
    '/dashboard',
    '/dashboard/records',
    '/dashboard/map',
    '/dashboard/reports/csv',
    '/dashboard/ecology/csv',
    ...HIDDEN_RECORDS.map((r) => `/dashboard/records/${r.id}`),
  ];
  const seen = new Set();
  const queue = [...start];
  const checked = [];
  while (queue.length > 0 && seen.size < max) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await fetch(`${site}${path}`, { redirect: 'manual' });
    const body = await res.text();
    const where = res.headers.get('location');
    checked.push({
      what: `page ${path}`,
      status: res.status,
      bytes: body.length,
      goesTo: where,
      spots: spotsIn(body),
    });
    if (path.startsWith('/dashboard') || res.status !== 200) continue;
    if (!(res.headers.get('content-type') ?? '').includes('text/html')) continue;
    for (const [, href] of body.matchAll(/href="(\/[^"#]*)"/g)) {
      const link = href.replace(/&amp;/g, '&');
      if (link.startsWith('/_next') || link.startsWith('/dashboard') || NOT_PAGES.test(link)) {
        continue;
      }
      if (!seen.has(link)) queue.push(link);
    }
  }
  return checked;
}

function printLines(lines) {
  for (const line of lines) {
    const extra = line.goesTo ? ` -> ${line.goesTo}` : '';
    const spots = line.spots.length > 0 ? `  SPOT FOUND: ${JSON.stringify(line.spots)}` : '';
    console.log(`${String(line.status).padEnd(4)} ${line.what} (${line.bytes} bytes)${extra}${spots}`);
  }
}

async function waitFor(site) {
  for (let i = 0; i < 180; i += 1) {
    try {
      const res = await fetch(`${site}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`The website at ${site} didn't answer in 6 minutes.`);
}

async function main() {
  const webAt = process.argv.indexOf('--web');
  const site = webAt === -1 ? null : process.argv[webAt + 1];
  const port = Number(process.env.STAND_IN_PORT || 54321);
  const standIn = await startStandIn({ port, log: () => {} });
  let failed = false;
  try {
    await addHiddenPlants(standIn.db);
    console.log(`Stand-in on ${standIn.url} with ${HIDDEN_RECORDS.length} hidden plants:`);
    for (const r of HIDDEN_RECORDS) console.log(`  ${tagOf(r.id)}  ${r.why}`);

    const api = await checkApi(standIn.url, standIn.db);
    console.log(`\nAPI, signed out (${api.length} reads)`);
    printLines(api);
    let lines = api;
    if (site) {
      console.log(`\nWaiting for the website at ${site} ...`);
      await waitFor(site);
      const pages = await checkWebsite(site);
      console.log(`\nWebsite, signed out (${pages.length} pages)`);
      printLines(pages);
      lines = lines.concat(pages);
      const staffOpen = pages.filter(
        (p) => p.what.startsWith('page /dashboard') && p.status === 200,
      );
      if (staffOpen.length > 0) {
        failed = true;
        console.log(`\n${staffOpen.length} staff pages opened without signing in.`);
      }
    }
    const leaks = lines.filter((l) => l.spots.length > 0);
    console.log(`\nExact spots found: ${leaks.length} in ${lines.length} reads and pages.`);
    if (leaks.length > 0) failed = true;
  } finally {
    await standIn.close();
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

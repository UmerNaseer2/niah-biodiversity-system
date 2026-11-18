// Times how long the website takes to send its pages, for the load test in
// docs/test-results/item-37-performance.md. It asks for each page a few times, one after another,
// then asks for the busiest pages several times at once. Run it from web/ with the website running:
//
//   TIME_EMAIL=admin@example.test TIME_PASSWORD=... node scripts/time-pages.mjs
//
// It defaults to the stand-in (http://127.0.0.1:54321) and the web-stand-in dev server on port 3210.
// Without TIME_EMAIL and TIME_PASSWORD it only times the public pages. Point it at the live site only
// with a test account, and only when nobody is relying on the site, because the CSV downloads read
// every record.
//
// RUNS (default 10) is how many loads each page gets, AT_ONCE (default 10) how many go at once,
// WARM=0 skips the first load that warms each page up, and ONLY=/dashboard,/plants only times those.
import { createServerClient } from '@supabase/ssr';

const SITE = (process.env.SITE_URL || 'http://127.0.0.1:3210').replace(/\/+$/, '');
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/+$/, '');
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'stand-in-anon-key';
const EMAIL = process.env.TIME_EMAIL;
const PASSWORD = process.env.TIME_PASSWORD;
const RUNS = Number(process.env.RUNS || 10);
const AT_ONCE = Number(process.env.AT_ONCE || 10);
const WARM = process.env.WARM !== '0';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const wanted = (path) => !ONLY || ONLY.includes(path.split('?')[0]) || ONLY.includes(path);

/** Something the anon key can read, for the pages that need a slug or a tag code */
async function firstRow(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY } });
  if (!res.ok) throw new Error(`Couldn't read ${path}: HTTP ${res.status}`);
  const [row] = await res.json();
  return row;
}

/** Signs in the way the website does and gives the Cookie header its pages expect */
async function signIn() {
  const jar = new Map();
  const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`Couldn't sign in: ${error.message}`);
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

/** One request, timed until the last byte of the page has arrived */
async function load(path, cookie) {
  const start = performance.now();
  const res = await fetch(`${SITE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const body = await res.arrayBuffer();
  return { ms: performance.now() - start, status: res.status, bytes: body.byteLength };
}

function sum(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { median: at(0.5), p95: at(0.95), max: sorted.at(-1) };
}

const seconds = (ms) => (ms / 1000).toFixed(2).padStart(6);
const size = (bytes) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} kB`);

/** A page is fine when it answers 200. A redirect on a staff page means the cookie was turned down. */
function check(path, result) {
  if (result.status !== 200) {
    throw new Error(`${path} answered HTTP ${result.status}, so its times would mean nothing`);
  }
}

async function timeOneAfterAnother(path, cookie) {
  if (!wanted(path)) return;
  // The first load compiles the page on a dev server
  if (WARM) check(path, await load(path, cookie));
  const results = [];
  for (let i = 0; i < RUNS; i++) results.push(await load(path, cookie));
  for (const r of results) check(path, r);
  const s = sum(results.map((r) => r.ms));
  console.log(
    `${path.padEnd(38)} ${seconds(s.median)} ${seconds(s.p95)} ${seconds(s.max)}   ${size(results[0].bytes)}`,
  );
}

async function timeAtOnce(path, cookie) {
  if (!wanted(path)) return;
  const start = performance.now();
  const results = await Promise.all(Array.from({ length: AT_ONCE }, () => load(path, cookie)));
  const all = performance.now() - start;
  for (const r of results) check(path, r);
  const s = sum(results.map((r) => r.ms));
  console.log(
    `${path.padEnd(38)} ${seconds(s.median)} ${seconds(s.p95)} ${seconds(s.max)}   all done in ${seconds(all).trim()} s`,
  );
}

const species = await firstRow('species_public?select=id&order=id&limit=1');
const record = await firstRow('records_public?select=tag_code&order=recorded_at.desc&limit=1');

const publicPages = [
  '/',
  '/plants',
  '/plants?q=fig',
  `/plants/${species.id}`,
  `/tag/${record.tag_code}`,
  '/tag',
];
const staffPages = [
  '/dashboard',
  '/dashboard/records',
  '/dashboard/review',
  '/dashboard/species',
  '/dashboard/reports',
  '/dashboard/reports/csv',
  '/dashboard/reports/csv?scope=all',
  '/dashboard/sensors',
  '/dashboard/ecology',
  '/dashboard/ecology/csv',
];

console.log(
  `Timing ${SITE} against ${SUPABASE_URL}, ${RUNS} loads each${WARM ? ' after one to warm up' : ''}\n`,
);
console.log(`${'One at a time'.padEnd(38)} median    p95    max   size (seconds)`);
for (const path of publicPages) await timeOneAfterAnother(path);

let cookie = null;
if (EMAIL && PASSWORD) {
  cookie = await signIn();
  for (const path of staffPages) await timeOneAfterAnother(path, cookie);
} else {
  console.log('\nNo TIME_EMAIL and TIME_PASSWORD, so the staff pages were left out.');
}

console.log(`\n${`${AT_ONCE} at once`.padEnd(38)} median    p95    max`);
await timeAtOnce('/plants?q=fig', null);
await timeAtOnce(`/tag/${record.tag_code}`, null);
if (cookie) {
  await timeAtOnce('/dashboard/records', cookie);
  await timeAtOnce('/dashboard/sensors', cookie);
}

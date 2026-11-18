// Checks which of our SQL files a Supabase project has, from outside, with only its URL and the
// anon (publishable) key. It only reads: each check asks for no rows of a table, view or column
// that a file adds. The only function it asks about is one the anon key isn't allowed to run, so
// the database turns it away before it runs, and it would only read if it did. Run it from
// supabase/tests with the website's keys:
//
//   node --env-file=../../web/.env.local check-hosted.js
//
// or set SUPABASE_URL and SUPABASE_ANON_KEY. Against the stand-in it's
// SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=stand-in-anon-key node check-hosted.js
//
// It exits with 0 when every file is in and edge-com is deployed the right way, 1 when something
// is missing, and 2 when it can't reach the project.

/**
 * Every SQL file in the order supabase/README.md runs them, with what can be seen of it through
 * the API. `table` and `column` are something the file adds. `gone` is something it takes away.
 * `fn` is a function it adds that only signed in staff can run, asked about with `args`. A file
 * with none of them only changes policies, triggers or functions, which the anon key can't see.
 */
const FILES = [
  { file: '001', table: 'species', column: 'id' },
  { file: '002', note: 'sample data' },
  { file: '003', gone: 'observations', note: 'the old observations view from 001 is gone' },
  { file: '004', table: 'records_public', column: '*' },
  { file: '005', table: 'records', column: 'tag_code' },
  { file: '006', table: 'species', column: 'rough_area_only' },
  { file: '007' },
  { file: '008', table: 'records', column: 'updated_at' },
  { file: '009', table: 'species_photos_public', column: '*' },
  { file: '010', table: 'deleted_records', column: '*' },
  { file: '011', table: 'exact_location_downloads', column: '*' },
  { file: '012' },
  { file: '013', table: 'record_history', column: '*' },
  { file: '014', table: 'records', column: 'photo_folder' },
  { file: '015' },
  { file: '016_1', table: 'iot_devices', column: '*' },
  { file: '016_2', table: 'iot_nodes', column: 'edge_device_id' },
  { file: '016_3', table: 'iot_device_tokens', column: '*' },
  { file: '016_4', table: 'iot_readings', column: '*' },
  { file: '017', table: 'iot_alerts', column: '*' },
  { file: '019' },
  { file: '020' },
  { file: '021', table: 'role_changes', column: '*' },
  { file: '022' },
  { file: '023', table: 'iot_boots', column: '*' },
  { file: '024', table: 'iot_alert_state', column: '*' },
  { file: '025', table: 'iot_commands', column: '*' },
  { file: '026', table: 'iot_alerts', column: 'dispatched_at' },
  { file: '027', table: 'iot_daily_summary', column: '*' },
  { file: '028', table: 'record_visits_public', column: '*' },
  { file: '029', fn: 'find_plant_by_tag', args: { code: '' } },
];

// From 006 on, each file stops on its first line if the one before it isn't there, so a file
// that's in means every file from 006 up to it is in too.
const CHAIN_START = FILES.findIndex((f) => f.file === '006');

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY, or run it with');
  console.error('node --env-file=../../web/.env.local check-hosted.js');
  process.exit(2);
}

class CantReach extends Error {}

/** Whether a table or view (and a column of it) is there: true, false, or a string saying why we can't tell. */
async function exists(table, column) {
  let res;
  try {
    res = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=0`, {
      headers: { apikey: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new CantReach(err.cause?.code || err.message);
  }
  if (res.ok) return true;
  const body = await res.json().catch(() => ({}));
  // Turned away because the anon key isn't allowed to read it, so it's there
  if (body.code === '42501') return true;
  // PostgREST doesn't know the table or view
  if (res.status === 404 && body.code === 'PGRST205') return false;
  // The table is there but the column isn't
  if (res.status === 400 && body.code === '42703') return false;
  if (res.status === 401 && !body.code) throw new CantReach('the key was turned down');
  return `HTTP ${res.status} ${body.code ?? ''}`.trim();
}

/**
 * Whether a function is there, the same way as exists(). The anon key isn't allowed to run it, so
 * the database answers 42501 when it's there, and PostgREST answers PGRST202 when it isn't.
 */
async function hasFunction(name, args) {
  let res;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new CantReach(err.cause?.code || err.message);
  }
  const body = await res.json().catch(() => ({}));
  if (body.code === '42501') return true;
  if (res.status === 404 && body.code === 'PGRST202') return false;
  if (res.status === 401 && !body.code) throw new CantReach('the key was turned down');
  return `HTTP ${res.status} ${body.code ?? ''}`.trim();
}

/** What the edge-com function says to a GET. It turns away anything but POST before doing anything. */
async function edgeCom() {
  let res;
  try {
    res = await fetch(`${url}/functions/v1/edge-com`, { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    return { ok: false, text: `couldn't reach it (${err.cause?.code || err.message})` };
  }
  if (res.status === 405) return { ok: true, text: 'deployed, with JWT verification off' };
  if (res.status === 401) {
    return { ok: false, text: 'deployed, but JWT verification is on, so the edge devices are turned away' };
  }
  if (res.status === 404) return { ok: false, text: 'not deployed' };
  return { ok: false, text: `answered HTTP ${res.status}, which this doesn't know` };
}

async function main() {
  console.log(`Checking ${url} (read only)\n`);

  const results = [];
  for (const f of FILES) {
    let state = 'unknown';
    let text = "can't tell from outside";
    if (f.table || f.fn) {
      const seen = f.table ? await exists(f.table, f.column) : await hasFunction(f.fn, f.args);
      if (seen === true) [state, text] = ['in', 'in'];
      else if (seen === false) [state, text] = ['missing', 'missing'];
      else text = `couldn't tell (${seen})`;
    } else if (f.gone) {
      const seen = await exists(f.gone, '*');
      if (seen === false) [state, text] = ['in', `in: ${f.note}`];
      else if (seen === true) [state, text] = ['missing', 'missing'];
      else text = `couldn't tell (${seen})`;
    } else if (f.note) {
      text = `can't tell from outside (${f.note})`;
    }
    results.push({ ...f, state, text });
  }

  // A file in the chain that can't be seen is missing when the one before it is, because it
  // would have stopped on its first line
  for (let i = CHAIN_START + 1; i < results.length; i++) {
    if (results[i].state === 'unknown' && results[i - 1].state === 'missing') {
      results[i].state = 'missing';
      results[i].text = `missing (it needs ${results[i - 1].file} first)`;
    }
  }

  // A file in the chain that's in vouches for the ones before it that can't be seen
  let newestInChain = -1;
  results.forEach((r, i) => {
    if (i >= CHAIN_START && r.state === 'in') newestInChain = i;
  });
  for (let i = CHAIN_START; i < newestInChain; i++) {
    if (results[i].state === 'unknown') {
      results[i].state = 'in';
      results[i].text = `in (${results[newestInChain].file} is in and needs it)`;
    }
  }

  const newestIn = results.findLastIndex((r) => r.state === 'in');
  const outOfOrder = results.filter((r, i) => i < newestIn && r.state === 'missing');

  for (const r of results) console.log(`${r.file.padEnd(6)} ${r.text}`);

  const fn = await edgeCom();
  console.log(`\nedge-com ${fn.text}`);

  // 002 is only for a new project, and running it again writes over the species facts. When 001
  // is in, 002 has almost certainly been run with it, so it's left off the list.
  const toRun = results
    .slice(newestIn + 1)
    .map((r) => r.file)
    .filter((file) => !(file === '002' && results[0].state === 'in'));
  console.log('');
  if (outOfOrder.length) {
    console.log(`Missing even though a later file is in: ${outOfOrder.map((r) => r.file).join(', ')}.`);
    console.log('That means the files were run out of order or on another project. Look at it by hand');
    console.log('before running anything.');
  }
  if (toRun.length === 0 && outOfOrder.length === 0) {
    console.log('Every SQL file is in.');
  } else if (toRun.length) {
    console.log(`Run these next, one at a time and in this order: ${toRun.join(', ')}.`);
    console.log('supabase/README.md says what to look out for with each one.');
  }

  const allIn = toRun.length === 0 && outOfOrder.length === 0;
  process.exitCode = allIn && fn.ok ? 0 : 1;
}

main().catch((err) => {
  if (err instanceof CantReach) {
    console.error(`Couldn't reach ${url}: ${err.message}`);
    process.exit(2);
  }
  throw err;
});

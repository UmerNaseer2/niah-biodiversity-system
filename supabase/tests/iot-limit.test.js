// Checks 022: one edge device can add up to 3,600 readings an hour, a call that goes over is
// refused whole, and other devices, older readings and readings sent twice don't count. PGlite has
// one connection, so two calls at the same moment can't be run here. The lock in 022 is what
// covers that. The last part does it through the stand-in, to see the HTTP 429.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { addUser, asUser, insertAs, newDatabase, readSql, SQL_FILES } from './harness.js';
import { ANON_KEY, startStandIn, TEST_DEVICE_ID, TEST_DEVICE_TOKEN } from './stand-in.js';

const FILE = '022_iot_reading_limit.sql';
const MOST = 3600;
const tooMany = { code: 'PT429', message: /too many readings in the last hour/ };

let db;
let admin;
let deviceCount = 0;
let readingCount = 0;

before(async () => {
  db = await newDatabase();
  admin = await addUser(db, { role: 'admin', name: 'Park admin' });
});

after(async () => {
  await db.close();
});

/** A new device with a token and one node, so each test has its own count. */
async function newDevice() {
  deviceCount += 1;
  const device = `LIMIT-${deviceCount}`;
  const node = `LIMIT-NODE-${deviceCount}`;
  await insertAs(db, admin, 'public.iot_devices', {
    device_id: device,
    name: `Limit ${deviceCount}`,
  });
  await db.query(
    'INSERT INTO public.iot_nodes (node_id, name, zone, edge_device_id) VALUES ($1, $2, $3, $4)',
    [node, `Limit node ${deviceCount}`, 'Test zone', device],
  );
  const { rows } = await asUser(db, admin, (tx) =>
    tx.query('SELECT public.iot_make_device_token($1) AS value', [device]),
  );
  return { device, node, token: rows[0].value.token };
}

/** A reading where nothing is wrong, with an ID of its own. */
function reading(node) {
  readingCount += 1;
  return {
    reading_id: `limit-${readingCount}`,
    node_id: node,
    recorded_at: new Date().toISOString(),
    temperature_c: 25,
    battery_percent: 90,
  };
}

/** What an edge device sends, as anon like the API does it. */
async function send({ device, token }, readings) {
  const { rows } = await asUser(db, null, (tx) =>
    tx.query('SELECT public.iot_add_readings($1, $2, $3::jsonb) AS value', [
      device,
      token,
      JSON.stringify(readings),
    ]),
  );
  return rows[0].value;
}

/**
 * Puts readings straight in the table with the triggers off, so a test can start close to the
 * limit without sending thousands. They count as received at the time given, or now.
 */
function fill(database, device, node, count, receivedAt = null) {
  return database.transaction(async (tx) => {
    await tx.query('SET LOCAL session_replication_role = replica');
    await tx.query(
      `INSERT INTO public.iot_readings (device_id, node_id, reading_id, recorded_at, received_at)
       SELECT $1, $2, 'fill-' || $3::text || '-' || n, now(), coalesce($4::timestamptz, now())
       FROM generate_series(1, $5::int) AS n`,
      [device, node, `${readingCount++}`, receivedAt, count],
    );
  });
}

async function countFor(device) {
  const { rows } = await db.query(
    'SELECT count(*)::int AS count FROM public.iot_readings WHERE device_id = $1',
    [device],
  );
  return rows[0].count;
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

describe('the hourly limit', () => {
  test('a device can add up to 3,600 readings in an hour', async () => {
    const one = await newDevice();
    await fill(db, one.device, one.node, MOST - 2);
    const answer = await send(one, [reading(one.node), reading(one.node)]);
    assert.deepEqual(answer, { accepted: 2, duplicates: 0, refused: [] });
    assert.equal(await countFor(one.device), MOST);
  });

  test('a call that goes over is refused whole, and a smaller one that fits works', async () => {
    const one = await newDevice();
    await fill(db, one.device, one.node, MOST - 1);
    const { rows: heardBefore } = await db.query(
      'SELECT last_heard_at FROM public.iot_devices WHERE device_id = $1',
      [one.device],
    );

    await assert.rejects(send(one, [reading(one.node), reading(one.node)]), tooMany);
    assert.equal(await countFor(one.device), MOST - 1, 'the first of the two is not kept either');
    const { rows: heardAfter } = await db.query(
      'SELECT last_heard_at FROM public.iot_devices WHERE device_id = $1',
      [one.device],
    );
    assert.deepEqual(heardAfter, heardBefore, 'a refused call does not count as hearing from it');

    assert.equal((await send(one, [reading(one.node)])).accepted, 1);
    await assert.rejects(send(one, [reading(one.node)]), tooMany);
    assert.equal(await countFor(one.device), MOST);
  });

  test('the error says what the limit is and what to do', async () => {
    const one = await newDevice();
    await fill(db, one.device, one.node, MOST);
    await assert.rejects(send(one, [reading(one.node)]), (error) => {
      assert.equal(error.code, 'PT429');
      assert.equal(error.detail, 'One device can send 3600 readings an hour.');
      assert.equal(error.hint, 'Send them again later.');
      return true;
    });
  });

  test('each device has its own count', async () => {
    const full = await newDevice();
    const other = await newDevice();
    await fill(db, full.device, full.node, MOST);
    await assert.rejects(send(full, [reading(full.node)]), tooMany);
    assert.equal((await send(other, [reading(other.node)])).accepted, 1);
  });

  test('readings received more than an hour ago no longer count', async () => {
    const one = await newDevice();
    await fill(db, one.device, one.node, MOST, minutesAgo(61));
    await fill(db, one.device, one.node, MOST - 1, minutesAgo(59));
    assert.equal((await send(one, [reading(one.node)])).accepted, 1);
    await assert.rejects(send(one, [reading(one.node)]), tooMany);
  });

  test('a reading sent again is skipped and does not count', async () => {
    const one = await newDevice();
    await fill(db, one.device, one.node, MOST - 1);
    const last = reading(one.node);
    assert.equal((await send(one, [last])).accepted, 1);
    const again = await send(one, [last]);
    assert.deepEqual(again, { accepted: 0, duplicates: 1, refused: [] });
    await assert.rejects(send(one, [reading(one.node)]), tooMany);
  });

  test('a wrong token is still turned away before the count', async () => {
    const one = await newDevice();
    await fill(db, one.device, one.node, MOST);
    const wrong = { device: one.device, token: 'not-the-token' };
    await assert.rejects(send(wrong, [reading(one.node)]), { code: '42501' });
  });
});

describe('the order the files run in', () => {
  test('022 stops on its first line if 021 has not been run', async () => {
    const partWay = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('021_role_changes.sql')),
    );
    try {
      await assert.rejects(partWay.exec(readSql(FILE)), /022 needs 021/);
      const { rows } = await partWay.query(
        "SELECT count(*)::int AS count FROM pg_trigger WHERE tgname = 'iot_limit_readings'",
      );
      assert.deepEqual(rows, [{ count: 0 }]);
    } finally {
      await partWay.close();
    }
  });
});

describe('running 022 again', () => {
  async function catalogs() {
    const queries = [
      `SELECT p.prosrc, p.prosecdef, p.proconfig,
         ARRAY(SELECT acl::text FROM unnest(p.proacl) AS acl ORDER BY 1) AS acl
       FROM pg_proc AS p
       WHERE p.oid = 'public.iot_limit_readings()'::regprocedure`,
      `SELECT tgname, tgtype, tgenabled::text AS enabled
       FROM pg_trigger
       WHERE NOT tgisinternal AND tgrelid = 'public.iot_readings'::regclass
       ORDER BY 1`,
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'iot_readings' ORDER BY 1`,
    ];
    const results = [];
    for (const query of queries) {
      results.push((await db.query(query)).rows);
    }
    return results;
  }

  test('ends up the same, with one trigger, and keeps the limit', async () => {
    const one = await newDevice();
    await fill(db, one.device, one.node, MOST);
    const firstTime = await catalogs();
    await db.exec(readSql(FILE));
    assert.deepEqual(await catalogs(), firstTime);
    const limitTriggers = firstTime[1].filter((row) => row.tgname === 'iot_limit_readings');
    assert.equal(limitTriggers.length, 1);
    await assert.rejects(send(one, [reading(one.node)]), tooMany);
  });
});

describe('through the stand-in, the way an edge device sends', () => {
  let standIn;

  before(async () => {
    standIn = await startStandIn({ port: 0, log: () => {} });
  });

  after(() => standIn.close());

  async function addReadings(readings) {
    const response = await fetch(`${standIn.url}/rest/v1/rpc/iot_add_readings`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device: TEST_DEVICE_ID, token: TEST_DEVICE_TOKEN, readings }),
    });
    return { status: response.status, body: await response.json() };
  }

  test('a device over the limit gets HTTP 429, and 200 again once it fits', async () => {
    const { rows } = await standIn.db.query(
      'SELECT node_id FROM public.iot_nodes WHERE edge_device_id = $1 ORDER BY node_id LIMIT 1',
      [TEST_DEVICE_ID],
    );
    const node = rows[0].node_id;

    const first = await addReadings([reading(node)]);
    assert.equal(first.status, 200);

    await fill(standIn.db, TEST_DEVICE_ID, node, MOST - 1);
    const over = await addReadings([reading(node)]);
    assert.equal(over.status, 429);
    assert.equal(over.body.code, 'PT429');
    assert.match(over.body.message, /too many readings/);
    assert.equal(over.body.hint, 'Send them again later.');

    await standIn.db.query(
      `UPDATE public.iot_readings SET received_at = now() - interval '2 hours'
       WHERE device_id = $1`,
      [TEST_DEVICE_ID],
    );
    assert.equal((await addReadings([reading(node)])).status, 200);
  });
});

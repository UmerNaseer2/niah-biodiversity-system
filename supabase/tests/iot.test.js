// Checks 016_iot_readings.sql and 017_iot_alerts.sql: device tokens, adding readings, who can read
// what, the threat rules, one alert for one problem, acknowledging and resolving, nodes going
// quiet, and that nothing from a node reaches the public. The last parts do the same through the
// stand-in, the way an edge device and the website do it, and then with the node simulator.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { addUser, asUser, insertAs, newDatabase, readSql, selectAs, SQL_FILES } from './harness.js';
import { ANON_KEY, startStandIn, TEST_PASSWORD, TEST_USERS } from './stand-in.js';

let db;
let botanist;
let researcher;
let visitor;
let officer;
let admin;
let tokenA;
let tokenB;
let nodeCount = 0;
let readingCount = 0;

/** A reading from a node where nothing is wrong. */
const calm = {
  temperature_c: 25,
  humidity_percent: 70,
  soil_moisture_percent: 50,
  rain_percent: 0,
  battery_percent: 90,
  tilt_degrees: 1,
  shock_g: 1,
  distance_change_cm: 0,
  motion_detected: false,
};

const notAllowed = { code: '42501', message: /permission denied/ };
const notTheirRole = { code: '42501', message: /row-level security/ };
const noReadings = { code: '42501', message: /can't add readings/ };

function who(user) {
  return user ? user.role : 'anon';
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Calls a function as a user, the way the API does an RPC. It gives back the one value. */
async function call(user, sql, params = []) {
  const { rows } = await asUser(db, user, (tx) => tx.query(`SELECT ${sql} AS value`, params));
  return rows[0].value;
}

function makeToken(user, device) {
  return call(user, 'public.iot_make_device_token($1)', [device]);
}

/** What an edge device sends. Anyone can call it, because it goes by the token. */
function send(device, token, readings) {
  return call(null, 'public.iot_add_readings($1, $2, $3::jsonb)', [
    device,
    token,
    JSON.stringify(readings),
  ]);
}

/** A reading with an ID of its own, sent from the node given. */
function reading(node, changes = {}) {
  readingCount += 1;
  return {
    reading_id: `test-${readingCount}`,
    node_id: node,
    recorded_at: new Date().toISOString(),
    ...calm,
    ...changes,
  };
}

function sendFrom(node, changes = {}, device = 'REGION-A', token = tokenA) {
  return send(device, token, [reading(node, changes)]);
}

/** A new node on the device given, so each test has its own readings and alerts. */
async function newNode(device = 'REGION-A') {
  nodeCount += 1;
  const id = `TEST-NODE-${nodeCount}`;
  await db.query(
    'INSERT INTO public.iot_nodes (node_id, name, zone, edge_device_id) VALUES ($1, $2, $3, $4)',
    [id, `Test node ${nodeCount}`, 'Test zone', device],
  );
  return id;
}

/** Reads straight from the table as the postgres user, so no rules get in the way. */
async function storedReadings(node) {
  const { rows } = await db.query(
    'SELECT * FROM public.iot_readings WHERE node_id = $1 ORDER BY id',
    [node],
  );
  return rows;
}

async function alertsFor(node, kind) {
  const { rows } = await db.query(
    `SELECT * FROM public.iot_alerts WHERE node_id = $1 AND ($2::text IS NULL OR kind = $2)
     ORDER BY id`,
    [node, kind ?? null],
  );
  return rows;
}

before(async () => {
  db = await newDatabase();
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
  researcher = await addUser(db, { role: 'researcher', name: 'Researcher' });
  visitor = await addUser(db, { name: 'Visitor' });
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
  admin = await addUser(db, { role: 'admin', name: 'Park admin' });

  await insertAs(db, admin, 'public.iot_devices', { device_id: 'REGION-A', name: 'Region A' });
  await insertAs(db, admin, 'public.iot_devices', { device_id: 'REGION-B', name: 'Region B' });
  tokenA = (await makeToken(admin, 'REGION-A')).token;
  tokenB = (await makeToken(admin, 'REGION-B')).token;
});

after(async () => {
  await db.close();
});

describe('device tokens', () => {
  test('only admins can make one', async () => {
    for (const user of [visitor, researcher, botanist, officer]) {
      await assert.rejects(makeToken(user, 'REGION-A'), { code: '42501' }, who(user));
    }
    await assert.rejects(makeToken(null, 'REGION-A'), notAllowed);
  });

  test('the plain token is handed back once and only its hash is kept', async () => {
    await insertAs(db, admin, 'public.iot_devices', { device_id: 'HASH-TEST', name: 'Hash test' });
    const made = await makeToken(admin, 'HASH-TEST');
    assert.deepEqual(Object.keys(made).sort(), ['device_id', 'token', 'token_made_at']);
    assert.match(made.token, /^niah_device_[0-9a-f]{64}$/);

    const { rows } = await db.query(
      "SELECT encode(token_hash, 'hex') AS hash FROM public.iot_device_tokens WHERE device_id = $1",
      ['HASH-TEST'],
    );
    const hash = createHash('sha256').update(made.token).digest('hex');
    assert.deepEqual(rows, [{ hash }]);

    // Nothing else in the row has it
    const { rows: device } = await db.query('SELECT * FROM public.iot_devices WHERE device_id = $1', [
      'HASH-TEST',
    ]);
    assert.ok(!JSON.stringify(device).includes(made.token));
    await assert.rejects(call(admin, 'public.iot_make_device_token($1)', ['NO-SUCH-DEVICE']), /no device/);
  });

  test('two tokens are never the same', async () => {
    const first = await makeToken(admin, 'HASH-TEST');
    const second = await makeToken(admin, 'HASH-TEST');
    assert.notEqual(first.token, second.token);
  });

  test('a new token stops the old one straight away', async () => {
    await insertAs(db, admin, 'public.iot_devices', { device_id: 'ROTATE', name: 'Rotate test' });
    const old = await makeToken(admin, 'ROTATE');
    assert.equal((await send('ROTATE', old.token, [])).accepted, 0);

    const replaced = await makeToken(admin, 'ROTATE');
    await assert.rejects(send('ROTATE', old.token, []), noReadings);
    assert.equal((await send('ROTATE', replaced.token, [])).accepted, 0);
  });

  test('the device says who made the token and when, and nobody can write that themselves', async () => {
    const startedAt = new Date();
    await makeToken(admin, 'ROTATE');
    const [device] = await selectAs(
      db,
      admin,
      'SELECT token_made_at, token_made_by_name FROM public.iot_devices WHERE device_id = $1',
      ['ROTATE'],
    );
    assert.equal(device.token_made_by_name, 'Park admin');
    assert.ok(device.token_made_at >= new Date(startedAt.getTime() - 1000));

    const forged = "UPDATE public.iot_devices SET token_made_by_name = 'Someone else' WHERE device_id = $1";
    await assert.rejects(selectAs(db, admin, forged, ['ROTATE']), notAllowed);
  });

  test('nobody reads or writes the hashes through the API, admins included', async () => {
    for (const user of [null, visitor, researcher, botanist, officer, admin]) {
      await assert.rejects(
        selectAs(db, user, 'SELECT * FROM public.iot_device_tokens'),
        notAllowed,
        who(user),
      );
      await assert.rejects(
        selectAs(db, user, "DELETE FROM public.iot_device_tokens WHERE device_id = 'REGION-A'"),
        notAllowed,
        who(user),
      );
    }
    const { rows } = await db.query(
      `SELECT
         has_table_privilege('service_role', 'public.iot_device_tokens', 'SELECT') AS service_reads,
         relrowsecurity
       FROM pg_class WHERE oid = 'public.iot_device_tokens'::regclass`,
    );
    assert.deepEqual(rows, [{ service_reads: false, relrowsecurity: true }]);
  });
});

describe('adding readings', () => {
  test('the right token adds a reading, and the server fills in the device and the arrival time', async () => {
    const node = await newNode();
    const startedAt = new Date();
    const sent = reading(node);
    assert.deepEqual(await send('REGION-A', tokenA, [sent]), {
      accepted: 1,
      duplicates: 0,
      refused: [],
    });

    const [stored] = await storedReadings(node);
    assert.equal(stored.device_id, 'REGION-A');
    assert.equal(stored.reading_id, sent.reading_id);
    assert.equal(Number(stored.temperature_c), 25);
    assert.equal(stored.motion_detected, false);
    assert.ok(stored.received_at >= new Date(startedAt.getTime() - 1000));
  });

  test('a reading can only give values, not choose its own device or arrival time', async () => {
    const node = await newNode();
    const lateAt = '2020-01-01T00:00:00Z';
    await sendFrom(node, { device_id: 'REGION-B', received_at: lateAt, id: 999999 });
    const [stored] = await storedReadings(node);
    assert.equal(stored.device_id, 'REGION-A');
    assert.notEqual(stored.received_at.getFullYear(), 2020);
    assert.notEqual(Number(stored.id), 999999);
  });

  test('a wrong token, an unknown device and a device turned off all get the same answer', async () => {
    await insertAs(db, admin, 'public.iot_devices', { device_id: 'TURNED-OFF', name: 'Off' });
    await insertAs(db, admin, 'public.iot_devices', { device_id: 'NO-TOKEN', name: 'No token' });
    const offToken = (await makeToken(admin, 'TURNED-OFF')).token;
    await selectAs(db, admin, 'UPDATE public.iot_devices SET enabled = false WHERE device_id = $1', [
      'TURNED-OFF',
    ]);

    const tries = [
      ['REGION-A', 'wrong'],
      ['REGION-A', tokenB],
      ['NO-SUCH-DEVICE', tokenA],
      ['NO-TOKEN', tokenA],
      ['TURNED-OFF', offToken],
      ['REGION-A', null],
      [null, tokenA],
      ['REGION-A', 'x'.repeat(201)],
    ];
    const answers = new Set();
    for (const [device, token] of tries) {
      await assert.rejects(send(device, token, []), (error) => {
        answers.add(`${error.code} ${error.message}`);
        return true;
      });
    }
    assert.equal(answers.size, 1);
    assert.match([...answers][0], /^42501 /);

    // Turning it back on lets it send again, with the same token
    await selectAs(db, admin, 'UPDATE public.iot_devices SET enabled = true WHERE device_id = $1', [
      'TURNED-OFF',
    ]);
    assert.equal((await send('TURNED-OFF', offToken, [])).accepted, 0);
  });

  test("a device can't add readings for another device's node, or find out which nodes exist", async () => {
    const theirs = await newNode('REGION-B');
    const unlinked = await newNode(null);
    const refused = await send('REGION-A', tokenA, [
      reading(theirs),
      reading(unlinked),
      reading('NO-SUCH-NODE'),
      reading(null),
    ]);
    assert.equal(refused.accepted, 0);
    assert.deepEqual(
      refused.refused.map((row) => row.why),
      Array(4).fill('node_not_on_this_device'),
    );
    assert.deepEqual(await storedReadings(theirs), []);
    assert.deepEqual(await storedReadings(unlinked), []);
  });

  test('two devices can use the same reading ID', async () => {
    const mine = await newNode('REGION-A');
    const theirs = await newNode('REGION-B');
    const id = { reading_id: 'same-id-on-both' };
    assert.equal((await sendFrom(mine, id)).accepted, 1);
    assert.equal((await sendFrom(theirs, id, 'REGION-B', tokenB)).accepted, 1);
    assert.equal((await storedReadings(mine)).length, 1);
    assert.equal((await storedReadings(theirs)).length, 1);
  });

  const ranges = [
    ['temperature_c', -20, 70, -21, 71],
    ['humidity_percent', 0, 100, -1, 101],
    ['soil_moisture_percent', 0, 100, -1, 101],
    ['rain_percent', 0, 100, -1, 101],
    ['battery_percent', 0, 100, -1, 101],
    ['tilt_degrees', 0, 180, -1, 181],
    ['shock_g', 0, 32, -1, 33],
    ['distance_change_cm', 0, 500, -1, 501],
  ];

  for (const [field, lowest, highest, tooLow, tooHigh] of ranges) {
    test(`${field} has to be from ${lowest} to ${highest}`, async () => {
      const node = await newNode();
      for (const value of [lowest, highest]) {
        assert.equal((await sendFrom(node, { [field]: value })).accepted, 1, `${value}`);
      }
      for (const value of [tooLow, tooHigh, 'NaN']) {
        const answer = await sendFrom(node, { [field]: value });
        assert.equal(answer.accepted, 0, `${value}`);
        assert.equal(answer.refused[0].why, `${field}_in_range`, `${value}`);
      }
      for (const value of ['hot', true, {}, 'Infinity', 99999999]) {
        const answer = await sendFrom(node, { [field]: value });
        assert.equal(answer.accepted, 0, `${value}`);
        assert.equal(answer.refused[0].why, 'bad_value', `${value}`);
      }
      assert.equal((await storedReadings(node)).length, 2);
    });
  }

  test('latitude and longitude have to be real and come together', async () => {
    const node = await newNode();
    const refusedFor = async (changes) => (await sendFrom(node, changes)).refused[0]?.why;
    assert.equal(await refusedFor({ latitude: 91, longitude: 0 }), 'latitude_in_range');
    assert.equal(await refusedFor({ latitude: 0, longitude: 181 }), 'longitude_in_range');
    assert.equal(await refusedFor({ latitude: 1 }), 'latitude_and_longitude_together');
    assert.equal(await refusedFor({ longitude: 1 }), 'latitude_and_longitude_together');
    assert.equal(await refusedFor({ latitude: 1, longitude: 1 }), undefined);
  });

  test('a reading with only some sensors is fine', async () => {
    const node = await newNode();
    const answer = await send('REGION-A', tokenA, [
      { reading_id: readingCount + '-only-soil', node_id: node, soil_moisture_percent: 40 },
    ]);
    assert.equal(answer.accepted, 1);
    const [stored] = await storedReadings(node);
    assert.equal(Number(stored.soil_moisture_percent), 40);
    assert.equal(stored.temperature_c, null);
    assert.equal(stored.motion_detected, null);
  });

  test('a batch can hold 100 readings but not 101', async () => {
    const node = await newNode();
    const many = Array.from({ length: 101 }, () => reading(node));
    await assert.rejects(send('REGION-A', tokenA, many), /At most 100/);
    assert.deepEqual(await storedReadings(node), []);
    assert.equal((await send('REGION-A', tokenA, many.slice(0, 100))).accepted, 100);
  });

  test('readings has to be a list', async () => {
    for (const notList of [{ reading_id: 'x' }, 'x', 5, null]) {
      await assert.rejects(send('REGION-A', tokenA, notList), /has to be a list/);
    }
    const node = await newNode();
    const answer = await send('REGION-A', tokenA, [5, 'x', [], reading(node)]);
    assert.equal(answer.accepted, 1);
    assert.deepEqual(
      answer.refused.map((row) => row.why),
      ['not_a_reading', 'not_a_reading', 'not_a_reading'],
    );
  });

  test('times have to make sense, and a missing time means now', async () => {
    const node = await newNode();
    const refusedFor = async (when) => (await sendFrom(node, { recorded_at: when })).refused[0]?.why;
    assert.equal(await refusedFor(minutesAgo(-6)), 'recorded_at_ahead');
    assert.equal(await refusedFor(minutesAgo(8 * 24 * 60)), 'recorded_at_too_old');
    assert.equal(await refusedFor('not a date'), 'bad_value');
    assert.equal(await refusedFor(minutesAgo(-4)), undefined);
    assert.equal(await refusedFor(minutesAgo(6 * 24 * 60)), undefined);

    const startedAt = new Date();
    const untimed = await newNode();
    await sendFrom(untimed, { recorded_at: undefined });
    const [stored] = await storedReadings(untimed);
    assert.ok(stored.recorded_at >= new Date(startedAt.getTime() - 1000));
  });

  test('a reading ID has to be short and plain', async () => {
    const node = await newNode();
    for (const id of ['', 'has space', "it's", 'x'.repeat(65)]) {
      const answer = await sendFrom(node, { reading_id: id });
      assert.equal(answer.refused[0].why, 'reading_id_format', id);
    }
    const answer = await sendFrom(node, { reading_id: undefined });
    assert.equal(answer.refused[0].why, 'reading_id_format');
  });

  test('one bad reading is turned down alone and the answer says which and why', async () => {
    const node = await newNode();
    const good = reading(node);
    const bad = reading(node, { humidity_percent: 300 });
    const alsoGood = reading(node);
    assert.deepEqual(await send('REGION-A', tokenA, [good, bad, alsoGood]), {
      accepted: 2,
      duplicates: 0,
      refused: [{ index: 1, reading_id: bad.reading_id, why: 'humidity_percent_in_range' }],
    });
    assert.equal((await storedReadings(node)).length, 2);
  });

  test('sending a reading again keeps the first one and adds nothing', async () => {
    const node = await newNode();
    const sent = reading(node, { temperature_c: 20 });
    assert.equal((await send('REGION-A', tokenA, [sent])).accepted, 1);
    assert.deepEqual(await send('REGION-A', tokenA, [sent]), {
      accepted: 0,
      duplicates: 1,
      refused: [],
    });

    const changed = { ...sent, temperature_c: 30 };
    assert.equal((await send('REGION-A', tokenA, [changed])).duplicates, 1);
    const stored = await storedReadings(node);
    assert.equal(stored.length, 1);
    assert.equal(Number(stored[0].temperature_c), 20);
  });

  test('the answer only has counts, never anything stored', async () => {
    const node = await newNode();
    const answer = await sendFrom(node, { latitude: 1, longitude: 1 });
    assert.deepEqual(Object.keys(answer).sort(), ['accepted', 'duplicates', 'refused']);
  });

  test('an empty batch says the device is alive and adds nothing', async () => {
    await db.query("UPDATE public.iot_devices SET last_heard_at = NULL WHERE device_id = 'REGION-B'");
    assert.deepEqual(await send('REGION-B', tokenB, []), { accepted: 0, duplicates: 0, refused: [] });
    const { rows } = await db.query(
      "SELECT last_heard_at FROM public.iot_devices WHERE device_id = 'REGION-B'",
    );
    assert.ok(rows[0].last_heard_at);
  });

  test('being signed in does not help: only the publishable key can call it', async () => {
    for (const user of [visitor, researcher, botanist, officer, admin]) {
      await assert.rejects(
        call(user, 'public.iot_add_readings($1, $2, $3::jsonb)', ['REGION-A', tokenA, '[]']),
        notAllowed,
        who(user),
      );
    }
  });

  test('every function has its search path locked and only the grants it needs', async () => {
    const { rows } = await db.query(`
      SELECT p.proname AS name, p.prosecdef AS definer, p.proconfig AS config,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service,
        ARRAY(SELECT 1 FROM unnest(p.proacl) AS acl WHERE acl::text LIKE '=%') AS public_grant
      FROM pg_proc AS p
      WHERE p.pronamespace = 'public'::regnamespace
        AND (p.proname LIKE 'iot\\_%')
      ORDER BY 1`);
    const called = {
      iot_acknowledge_alert: 'authenticated',
      iot_add_readings: 'anon',
      iot_check_alerts: 'authenticated',
      iot_check_reading: null,
      iot_device_heard: null,
      iot_make_device_token: 'authenticated',
      iot_raise_alert: null,
      iot_raise_quiet_alerts: null,
      iot_resolve_alert: 'authenticated',
    };
    assert.deepEqual(
      rows.map((row) => row.name),
      Object.keys(called),
    );
    for (const row of rows) {
      assert.equal(row.definer, true, row.name);
      assert.deepEqual(row.config, ['search_path=""'], row.name);
      assert.equal(row.anon, called[row.name] === 'anon', `${row.name} anon`);
      assert.equal(row.authenticated, called[row.name] === 'authenticated', `${row.name} signed in`);
      assert.equal(row.service, false, `${row.name} service role`);
      assert.deepEqual(row.public_grant, [], row.name);
    }
  });
});

describe('who reads and changes what', () => {
  let node;

  before(async () => {
    node = await newNode();
    await sendFrom(node, { tilt_degrees: 90 });
  });

  test('only officers and admins read readings and alerts', async () => {
    for (const table of ['iot_readings', 'iot_alerts']) {
      const sql = `SELECT id FROM public.${table} WHERE node_id = $1`;
      for (const user of [officer, admin]) {
        assert.equal((await selectAs(db, user, sql, [node])).length, 1, `${table} ${who(user)}`);
      }
      for (const user of [visitor, researcher, botanist]) {
        assert.deepEqual(await selectAs(db, user, sql, [node]), [], `${table} ${who(user)}`);
      }
      await assert.rejects(selectAs(db, null, sql, [node]), notAllowed, table);
    }
  });

  test('nobody adds, changes or removes a reading or an alert directly, admins included', async () => {
    const writes = [
      `INSERT INTO public.iot_readings (device_id, node_id, reading_id, recorded_at)
       VALUES ('REGION-A', '${node}', 'by-hand', now())`,
      `UPDATE public.iot_readings SET temperature_c = 1 WHERE node_id = '${node}'`,
      `DELETE FROM public.iot_readings WHERE node_id = '${node}'`,
      `INSERT INTO public.iot_alerts (node_id, node_name, kind, severity, first_seen_at, last_seen_at)
       VALUES ('${node}', 'x', 'quiet', 'urgent', now(), now())`,
      `UPDATE public.iot_alerts SET status = 'resolved', resolved_at = now() WHERE node_id = '${node}'`,
      `DELETE FROM public.iot_alerts WHERE node_id = '${node}'`,
    ];
    for (const sql of writes) {
      for (const user of [null, visitor, researcher, botanist, officer, admin]) {
        await assert.rejects(selectAs(db, user, sql), notAllowed, `${who(user)}: ${sql}`);
      }
    }
    assert.equal((await storedReadings(node)).length, 1);
    assert.equal((await alertsFor(node)).length, 1);
  });

  test('only admins see and manage devices', async () => {
    const list = 'SELECT device_id FROM public.iot_devices WHERE device_id = $1';
    const rename = "UPDATE public.iot_devices SET name = 'Changed' WHERE device_id = $1 RETURNING device_id";
    const remove = 'DELETE FROM public.iot_devices WHERE device_id = $1 RETURNING device_id';
    const device = { device_id: 'NOT-ALLOWED', name: 'Not allowed' };
    assert.deepEqual(await selectAs(db, admin, list, ['REGION-A']), [{ device_id: 'REGION-A' }]);

    for (const user of [visitor, researcher, botanist, officer]) {
      assert.deepEqual(await selectAs(db, user, list, ['REGION-A']), [], who(user));
      assert.deepEqual(await selectAs(db, user, rename, ['REGION-A']), [], who(user));
      assert.deepEqual(await selectAs(db, user, remove, ['REGION-A']), [], who(user));
      await assert.rejects(insertAs(db, user, 'public.iot_devices', device), notTheirRole, who(user));
    }
    await assert.rejects(selectAs(db, null, list, ['REGION-A']), notAllowed);
    await assert.rejects(insertAs(db, null, 'public.iot_devices', device), notAllowed);
  });

  test('admins only set the name, the zone and whether a device is on', async () => {
    const forge = [
      "UPDATE public.iot_devices SET last_heard_at = now() WHERE device_id = 'REGION-A'",
      "UPDATE public.iot_devices SET token_made_at = now() WHERE device_id = 'REGION-A'",
      "UPDATE public.iot_devices SET device_id = 'RENAMED' WHERE device_id = 'REGION-A'",
    ];
    for (const sql of forge) {
      await assert.rejects(selectAs(db, admin, sql), notAllowed, sql);
    }
    await assert.rejects(
      insertAs(db, admin, 'public.iot_devices', {
        device_id: 'FORGED',
        name: 'Forged',
        token_made_at: new Date().toISOString(),
      }),
      notAllowed,
    );
    await assert.rejects(
      insertAs(db, admin, 'public.iot_devices', { device_id: 'has space', name: 'Bad ID' }),
      { code: '23514' },
    );
  });

  test('only admins link a node to a device', async () => {
    const link = "UPDATE public.iot_nodes SET edge_device_id = 'REGION-B' WHERE node_id = $1 RETURNING node_id";
    const free = await newNode();
    for (const user of [visitor, researcher, botanist, officer]) {
      assert.deepEqual(await selectAs(db, user, link, [free]), [], who(user));
    }
    await assert.rejects(selectAs(db, null, link, [free]), notAllowed);
    assert.deepEqual(await selectAs(db, admin, link, [free]), [{ node_id: free }]);
  });

  test("a device or node with history can't be removed, and one without can", async () => {
    await assert.rejects(
      selectAs(db, admin, 'DELETE FROM public.iot_nodes WHERE node_id = $1', [node]),
      { code: '23503' },
    );
    await assert.rejects(
      selectAs(db, admin, "DELETE FROM public.iot_devices WHERE device_id = 'REGION-A'"),
      { code: '23503' },
    );

    await insertAs(db, admin, 'public.iot_devices', { device_id: 'EMPTY', name: 'No history' });
    await makeToken(admin, 'EMPTY');
    const unused = await newNode('EMPTY');
    await selectAs(db, admin, "DELETE FROM public.iot_devices WHERE device_id = 'EMPTY'");
    // Removing a device takes its token with it and leaves its node unlinked
    const { rows: tokens } = await db.query(
      "SELECT device_id FROM public.iot_device_tokens WHERE device_id = 'EMPTY'",
    );
    assert.deepEqual(tokens, []);
    const { rows: nodes } = await db.query(
      'SELECT edge_device_id FROM public.iot_nodes WHERE node_id = $1',
      [unused],
    );
    assert.deepEqual(nodes, [{ edge_device_id: null }]);
    await selectAs(db, admin, 'DELETE FROM public.iot_nodes WHERE node_id = $1', [unused]);
  });

  test('every IoT table has Row Level Security on', async () => {
    const { rows } = await db.query(`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class AS c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname LIKE 'iot\\_%'
      ORDER BY 1`);
    assert.deepEqual(rows, [
      'iot_alert_limits',
      'iot_alerts',
      'iot_device_tokens',
      'iot_devices',
      'iot_nodes',
      'iot_readings',
    ].map((relname) => ({ relname, relrowsecurity: true })));
  });
});

describe('threat rules', () => {
  const rules = [
    ['tilt_degrees', 31, 30, 'disturbance', 'urgent'],
    ['shock_g', 3, 2.5, 'disturbance', 'urgent'],
    ['distance_change_cm', 11, 10, 'disturbance', 'urgent'],
    ['soil_moisture_percent', 19, 20, 'soil_dry', 'routine'],
    ['soil_moisture_percent', 86, 85, 'soil_wet', 'routine'],
    ['temperature_c', 41, 40, 'too_hot', 'routine'],
    ['temperature_c', 14, 15, 'too_cold', 'routine'],
    ['battery_percent', 19, 20, 'battery_low', 'routine'],
  ];

  for (const [field, value, limit, kind, severity] of rules) {
    test(`${field} at ${value} raises a ${severity} ${kind} alert, and at ${limit} it doesn't`, async () => {
      const node = await newNode();
      await sendFrom(node, { [field]: limit });
      assert.deepEqual(await alertsFor(node), []);

      const seenAt = minutesAgo(1);
      await sendFrom(node, { [field]: value, recorded_at: seenAt });
      const [alert] = await alertsFor(node);
      assert.equal(alert.kind, kind);
      assert.equal(alert.severity, severity);
      assert.equal(alert.status, 'open');
      assert.equal(alert.reading_field, field);
      assert.equal(Number(alert.reading_value), value);
      assert.equal(Number(alert.limit_value), limit);
      assert.equal(alert.repeat_count, 1);
      assert.equal(alert.first_seen_at.toISOString(), seenAt);
      assert.equal(alert.node_name.startsWith('Test node'), true);
    });
  }

  test('the PIR raises a routine alert, because animals set it off too', async () => {
    const node = await newNode();
    await sendFrom(node, { motion_detected: true });
    const [alert] = await alertsFor(node);
    assert.equal(alert.kind, 'movement');
    assert.equal(alert.severity, 'routine');
  });

  test('a calm reading raises nothing, and neither does a sensor the node lacks', async () => {
    const node = await newNode();
    await sendFrom(node);
    await send('REGION-A', tokenA, [{ reading_id: `empty-${node}`, node_id: node }]);
    assert.deepEqual(await alertsFor(node), []);
  });

  test('a refused reading raises nothing', async () => {
    const node = await newNode();
    await sendFrom(node, { tilt_degrees: 999 });
    assert.deepEqual(await alertsFor(node), []);
  });

  test('50 readings of one problem are one alert with a count of 50', async () => {
    const node = await newNode();
    const readings = Array.from({ length: 50 }, () => reading(node, { tilt_degrees: 80 }));
    await send('REGION-A', tokenA, readings);
    const alerts = await alertsFor(node);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].repeat_count, 50);
  });

  test('tilt, a knock and a change in distance on one node are all one disturbance', async () => {
    const node = await newNode();
    await sendFrom(node, { tilt_degrees: 80, shock_g: 5, distance_change_cm: 50 });
    const alerts = await alertsFor(node);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].repeat_count, 1);
    assert.equal(alerts[0].reading_field, 'tilt_degrees');
  });

  test('different problems and different nodes get their own alerts', async () => {
    const one = await newNode();
    const two = await newNode();
    await sendFrom(one, { tilt_degrees: 80, soil_moisture_percent: 5 });
    await sendFrom(two, { tilt_degrees: 80 });
    assert.deepEqual(
      (await alertsFor(one)).map((alert) => alert.kind).sort(),
      ['disturbance', 'soil_dry'],
    );
    assert.equal((await alertsFor(two)).length, 1);
  });

  test('sending a reading again does not count it twice', async () => {
    const node = await newNode();
    const sent = reading(node, { tilt_degrees: 80 });
    await send('REGION-A', tokenA, [sent]);
    await send('REGION-A', tokenA, [sent]);
    const [alert] = await alertsFor(node);
    assert.equal(alert.repeat_count, 1);
  });

  test('an old reading from a buffer widens the times but keeps the newest value', async () => {
    const node = await newNode();
    const newer = minutesAgo(1);
    const older = minutesAgo(5);
    await sendFrom(node, { tilt_degrees: 80, recorded_at: newer });
    await sendFrom(node, { tilt_degrees: 40, recorded_at: older });
    const [alert] = await alertsFor(node);
    assert.equal(alert.repeat_count, 2);
    assert.equal(alert.first_seen_at.toISOString(), older);
    assert.equal(alert.last_seen_at.toISOString(), newer);
    assert.equal(Number(alert.reading_value), 80);
  });

  test('a problem that carries on after it is resolved waits, then makes a new alert', async () => {
    const node = await newNode();
    await sendFrom(node, { soil_moisture_percent: 5 });
    const [first] = await alertsFor(node);
    await call(officer, 'public.iot_resolve_alert($1)', [first.id]);

    // Still dry, straight after someone said it was dealt with
    await sendFrom(node, { soil_moisture_percent: 5 });
    assert.equal((await alertsFor(node)).length, 1);

    // A reading from before they resolved it is not news
    await db.query(
      "UPDATE public.iot_alerts SET resolved_at = now() - INTERVAL '61 minutes' WHERE id = $1",
      [first.id],
    );
    await sendFrom(node, { soil_moisture_percent: 5, recorded_at: minutesAgo(70) });
    assert.equal((await alertsFor(node)).length, 1);

    await sendFrom(node, { soil_moisture_percent: 5 });
    const alerts = await alertsFor(node);
    assert.equal(alerts.length, 2);
    assert.equal(alerts[1].status, 'open');
    assert.equal(alerts[1].repeat_count, 1);
  });

  test('a reading on an acknowledged alert counts on the same alert and stays acknowledged', async () => {
    const node = await newNode();
    await sendFrom(node, { tilt_degrees: 80 });
    const [alert] = await alertsFor(node);
    await call(officer, 'public.iot_acknowledge_alert($1)', [alert.id]);
    await sendFrom(node, { tilt_degrees: 80 });
    const alerts = await alertsFor(node);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].status, 'acknowledged');
    assert.equal(alerts[0].repeat_count, 2);
  });
});

describe('the limits the rules use', () => {
  test('officers and admins read them, and everyone else gets nothing', async () => {
    const sql = 'SELECT tilt_degrees_max FROM public.iot_alert_limits';
    for (const user of [officer, admin]) {
      assert.deepEqual(await selectAs(db, user, sql), [{ tilt_degrees_max: '30' }], who(user));
    }
    for (const user of [visitor, researcher, botanist]) {
      assert.deepEqual(await selectAs(db, user, sql), [], who(user));
    }
    await assert.rejects(selectAs(db, null, sql), notAllowed);
  });

  test('only admins change them, and the rules follow straight away', async () => {
    const change = 'UPDATE public.iot_alert_limits SET tilt_degrees_max = $1 RETURNING tilt_degrees_max';
    for (const user of [visitor, researcher, botanist, officer]) {
      assert.deepEqual(await selectAs(db, user, change, [5]), [], who(user));
    }
    await assert.rejects(selectAs(db, null, change, [5]), notAllowed);

    const node = await newNode();
    try {
      await selectAs(db, admin, change, [50]);
      await sendFrom(node, { tilt_degrees: 40 });
      assert.deepEqual(await alertsFor(node), []);
    } finally {
      await selectAs(db, admin, change, [30]);
    }
  });

  test('there is only ever one row, and nonsense limits are turned down', async () => {
    await assert.rejects(
      selectAs(db, admin, 'INSERT INTO public.iot_alert_limits (only_row) VALUES (true)'),
      notAllowed,
    );
    await assert.rejects(selectAs(db, admin, 'DELETE FROM public.iot_alert_limits'), notAllowed);
    await assert.rejects(
      selectAs(db, admin, 'UPDATE public.iot_alert_limits SET soil_moisture_min = 90'),
      { code: '23514' },
    );
    await assert.rejects(
      selectAs(db, admin, 'UPDATE public.iot_alert_limits SET quiet_minutes = 0'),
      { code: '23514' },
    );
  });
});

describe('acknowledging and resolving', () => {
  async function openAlert() {
    const node = await newNode();
    await sendFrom(node, { tilt_degrees: 80 });
    return (await alertsFor(node))[0];
  }

  async function stored(id) {
    const { rows } = await db.query('SELECT * FROM public.iot_alerts WHERE id = $1', [id]);
    return rows[0];
  }

  test('both say who and when, for officers and admins', async () => {
    for (const user of [officer, admin]) {
      const { id } = await openAlert();
      const startedAt = new Date(Date.now() - 1000);

      assert.deepEqual(await call(user, 'public.iot_acknowledge_alert($1)', [id]), {
        id,
        status: 'acknowledged',
      });
      const seen = await stored(id);
      assert.equal(seen.status, 'acknowledged');
      assert.equal(seen.acknowledged_by, user.id);
      assert.equal(seen.acknowledged_by_name, user.name);
      assert.ok(seen.acknowledged_at >= startedAt);
      assert.equal(seen.resolved_at, null);

      assert.deepEqual(await call(user, 'public.iot_resolve_alert($1)', [id]), {
        id,
        status: 'resolved',
      });
      const done = await stored(id);
      assert.equal(done.status, 'resolved');
      assert.equal(done.resolved_by, user.id);
      assert.equal(done.resolved_by_name, user.name);
      assert.ok(done.resolved_at >= startedAt);
      assert.equal(done.closed_by_itself, false);
    }
  });

  test('an alert can be resolved without being acknowledged first', async () => {
    const { id } = await openAlert();
    await call(officer, 'public.iot_resolve_alert($1)', [id]);
    const done = await stored(id);
    assert.equal(done.status, 'resolved');
    assert.equal(done.acknowledged_at, null);
  });

  test('doing it twice keeps the first person', async () => {
    const { id } = await openAlert();
    await call(officer, 'public.iot_acknowledge_alert($1)', [id]);
    const first = await stored(id);
    await call(admin, 'public.iot_acknowledge_alert($1)', [id]);
    const again = await stored(id);
    assert.equal(again.acknowledged_by, officer.id);
    assert.equal(again.acknowledged_at.getTime(), first.acknowledged_at.getTime());

    await call(officer, 'public.iot_resolve_alert($1)', [id]);
    await call(admin, 'public.iot_resolve_alert($1)', [id]);
    assert.equal((await stored(id)).resolved_by, officer.id);

    // Acknowledging something already resolved leaves it resolved
    assert.equal((await call(admin, 'public.iot_acknowledge_alert($1)', [id])).status, 'resolved');
    assert.equal((await stored(id)).status, 'resolved');
  });

  test('anyone else is turned down and the alert stays as it was', async () => {
    const { id } = await openAlert();
    for (const fn of ['iot_acknowledge_alert', 'iot_resolve_alert']) {
      for (const user of [visitor, researcher, botanist]) {
        await assert.rejects(call(user, `public.${fn}($1)`, [id]), { code: '42501' }, who(user));
      }
      await assert.rejects(call(null, `public.${fn}($1)`, [id]), notAllowed);
    }
    assert.equal((await stored(id)).status, 'open');
  });

  test('an alert that does not exist gets a clear answer', async () => {
    await assert.rejects(call(officer, 'public.iot_acknowledge_alert($1)', [999999]), /no alert/);
    await assert.rejects(call(officer, 'public.iot_resolve_alert($1)', [999999]), /no alert/);
  });

  test('the database only lets one unresolved alert exist for one problem', async () => {
    const { node_id: node } = await openAlert();
    await assert.rejects(
      db.query(
        `INSERT INTO public.iot_alerts (node_id, node_name, kind, severity, first_seen_at, last_seen_at)
         VALUES ($1, 'x', 'disturbance', 'urgent', now(), now())`,
        [node],
      ),
      { code: '23505' },
    );
  });
});

describe('nodes going quiet', () => {
  const check = () => call(officer, 'public.iot_check_alerts()');

  test('no reading for too long makes one urgent alert, however often it is checked', async () => {
    const node = await newNode();
    await sendFrom(node, { recorded_at: minutesAgo(20) });
    await check();
    await check();
    const alerts = await alertsFor(node, 'quiet');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].severity, 'urgent');
    assert.equal(alerts[0].status, 'open');
    assert.equal(alerts[0].repeat_count, 1);
    assert.equal(Number(alerts[0].reading_value), 20);
    assert.equal(Number(alerts[0].limit_value), 15);
  });

  test('under the limit nothing happens', async () => {
    const node = await newNode();
    await sendFrom(node, { recorded_at: minutesAgo(14) });
    await check();
    assert.deepEqual(await alertsFor(node, 'quiet'), []);
  });

  test('resolving it does not bring it back during the same silence', async () => {
    const node = await newNode();
    await sendFrom(node, { recorded_at: minutesAgo(20) });
    await check();
    const [alert] = await alertsFor(node, 'quiet');
    await call(officer, 'public.iot_resolve_alert($1)', [alert.id]);
    await check();
    assert.equal((await alertsFor(node, 'quiet')).length, 1);
  });

  test('a new reading closes it by itself, and a later silence makes a new alert', async () => {
    const node = await newNode();
    await sendFrom(node, { recorded_at: minutesAgo(20) });
    await check();
    await sendFrom(node);
    const [closed] = await alertsFor(node, 'quiet');
    assert.equal(closed.status, 'resolved');
    assert.equal(closed.closed_by_itself, true);
    assert.equal(closed.resolved_by, null);

    await db.query(
      `UPDATE public.iot_readings SET recorded_at = recorded_at - INTERVAL '10 minutes'
       WHERE node_id = $1`,
      [node],
    );
    await check();
    assert.equal((await alertsFor(node, 'quiet')).length, 1);
    await db.query(
      `UPDATE public.iot_alerts SET first_seen_at = first_seen_at - INTERVAL '1 hour'
       WHERE node_id = $1`,
      [node],
    );
    await db.query(
      `UPDATE public.iot_readings SET recorded_at = recorded_at - INTERVAL '10 minutes'
       WHERE node_id = $1`,
      [node],
    );
    await check();
    const alerts = await alertsFor(node, 'quiet');
    assert.equal(alerts.length, 2);
    assert.equal(alerts[1].status, 'open');
  });

  test('an old reading from a buffer does not close it, because the node may still be quiet', async () => {
    const node = await newNode();
    await sendFrom(node, { recorded_at: minutesAgo(30) });
    await check();
    await sendFrom(node, { recorded_at: minutesAgo(20) });
    const alerts = await alertsFor(node, 'quiet');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].status, 'open');
  });

  test('if the battery was already low it is routine, because that is the likely reason', async () => {
    const node = await newNode();
    await sendFrom(node, { recorded_at: minutesAgo(20), battery_percent: 10 });
    await check();
    const [alert] = await alertsFor(node, 'quiet');
    assert.equal(alert.severity, 'routine');
  });

  test('a delivery from any device catches a node that has stopped on another', async () => {
    const node = await newNode('REGION-A');
    await sendFrom(node);
    await db.query(
      `UPDATE public.iot_readings SET recorded_at = now() - INTERVAL '20 minutes'
       WHERE node_id = $1`,
      [node],
    );
    await send('REGION-B', tokenB, []);
    assert.equal((await alertsFor(node, 'quiet')).length, 1);
  });

  test('a node that has never sent anything is not quiet, so the sample nodes stay silent', async () => {
    const node = await newNode();
    await check();
    assert.deepEqual(await alertsFor(node), []);
    const { rows } = await db.query(
      "SELECT count(*)::integer AS alerts FROM public.iot_alerts WHERE node_id LIKE 'NNP-IOT-%'",
    );
    assert.deepEqual(rows, [{ alerts: 0 }]);
  });

  test('the count for the staff menu only has alerts nobody has picked up', async () => {
    const start = await check();
    const node = await newNode();
    await sendFrom(node, { tilt_degrees: 80, soil_moisture_percent: 5 });

    const raised = await check();
    assert.equal(raised.urgent, start.urgent + 1);
    assert.equal(raised.open, start.open + 2);

    const alerts = await alertsFor(node);
    const urgent = alerts.find((alert) => alert.severity === 'urgent');
    await call(officer, 'public.iot_acknowledge_alert($1)', [urgent.id]);
    const picked = await check();
    assert.equal(picked.urgent, start.urgent);
    assert.equal(picked.open, start.open + 1);

    const routine = alerts.find((alert) => alert.severity === 'routine');
    await call(officer, 'public.iot_resolve_alert($1)', [routine.id]);
    assert.equal((await check()).open, start.open);
  });

  test('only officers and admins can check, and nobody can run the scan directly', async () => {
    assert.ok(await call(admin, 'public.iot_check_alerts()'));
    for (const user of [visitor, researcher, botanist]) {
      await assert.rejects(call(user, 'public.iot_check_alerts()'), { code: '42501' }, who(user));
    }
    await assert.rejects(call(null, 'public.iot_check_alerts()'), notAllowed);
    for (const user of [null, visitor, researcher, botanist, officer, admin]) {
      await assert.rejects(call(user, 'public.iot_raise_quiet_alerts()'), notAllowed, who(user));
      await assert.rejects(
        call(user, "public.iot_raise_alert('x', 'quiet', 'urgent', 'x', 1, 1, now(), 1)"),
        notAllowed,
        who(user),
      );
    }
  });
});

describe('the status view for the Sensors page', () => {
  const sql = 'SELECT * FROM public.iot_node_status WHERE node_id = $1';

  test('it shows the newest reading, even when an older one arrives after it', async () => {
    const node = await newNode();
    await sendFrom(node, { temperature_c: 30 });
    await sendFrom(node, { temperature_c: 20, recorded_at: minutesAgo(5) });
    const [row] = await selectAs(db, officer, sql, [node]);
    assert.equal(Number(row.temperature_c), 30);
    assert.equal(row.quiet, false);
  });

  test('it says when a node is quiet, and a node with no readings is not', async () => {
    const stopped = await newNode();
    await sendFrom(stopped, { recorded_at: minutesAgo(20) });
    const [quiet] = await selectAs(db, officer, sql, [stopped]);
    assert.equal(quiet.quiet, true);

    const unused = await newNode();
    const [waiting] = await selectAs(db, officer, sql, [unused]);
    assert.equal(waiting.quiet, false);
    assert.equal(waiting.last_reading_at, null);
    assert.equal(waiting.temperature_c, null);
  });

  test('the made up numbers from 002 never show as readings', async () => {
    const [seed] = await selectAs(db, officer, sql, ['NNP-IOT-01']);
    assert.equal(seed.last_reading_at, null);
    assert.equal(seed.temperature_c, null);
    assert.equal(seed.battery_percent, null);
    assert.equal(seed.humidity_percent, null);
    assert.equal(seed.soil_moisture_percent, null);
    assert.equal(seed.tilt_degrees, null);
    assert.equal(seed.motion_detected, null);
  });

  test('it has no coordinates and none of the old columns from 001', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'iot_node_status'`);
    const columns = rows.map((row) => row.column_name);
    for (const left of ['latitude', 'longitude', 'status', 'last_heartbeat', 'threat_details']) {
      assert.ok(!columns.includes(left), left);
    }
  });

  test('only officers and admins get rows', async () => {
    assert.equal((await selectAs(db, admin, sql, ['NNP-IOT-01'])).length, 1);
    for (const user of [visitor, researcher, botanist]) {
      assert.deepEqual(await selectAs(db, user, sql, ['NNP-IOT-01']), [], who(user));
    }
    await assert.rejects(selectAs(db, null, sql, ['NNP-IOT-01']), notAllowed);
  });
});

describe('nothing from a node reaches the public', () => {
  // Made up for this test, and nowhere near anything real
  const latitude = 12.345678;
  const longitude = 98.765432;
  let node;

  before(async () => {
    node = await newNode();
    await sendFrom(node, { latitude, longitude });
  });

  test('anon reads the same three views as before, and no IoT table', async () => {
    const { rows } = await db.query(`
      SELECT c.relname
      FROM pg_class AS c
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relkind IN ('r', 'v', 'm')
        AND has_table_privilege('anon', c.oid, 'SELECT')
      ORDER BY 1`);
    assert.deepEqual(
      rows.map((row) => row.relname),
      ['records_public', 'species_photos_public', 'species_public'],
    );
  });

  test('what the public views show has nothing from a node in it', async () => {
    for (const view of ['records_public', 'species_photos_public', 'species_public']) {
      const rows = await selectAs(db, null, `SELECT * FROM public.${view}`);
      const text = JSON.stringify(rows);
      for (const bit of [String(latitude), String(longitude), node, 'REGION-A', 'NNP-IOT']) {
        assert.ok(!text.includes(bit), `${view} has ${bit}`);
      }
    }
  });

  test('no view other than the staff one reads the IoT tables', async () => {
    const { rows } = await db.query(`
      SELECT viewname FROM pg_views
      WHERE schemaname = 'public' AND definition ~ 'iot_'
      ORDER BY 1`);
    assert.deepEqual(rows, [{ viewname: 'iot_node_status' }]);
  });

  test('the staff view does not show coordinates either', async () => {
    const [row] = await selectAs(db, officer, 'SELECT * FROM public.iot_node_status WHERE node_id = $1', [
      node,
    ]);
    assert.ok(!JSON.stringify(row).includes(String(latitude)));
  });

  test('the only IoT function anon can call is the one that adds readings', async () => {
    const { rows } = await db.query(`
      SELECT p.proname
      FROM pg_proc AS p
      WHERE p.pronamespace = 'public'::regnamespace
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
        AND (p.proname LIKE 'iot\\_%' OR p.prosrc ~ 'iot_')
      ORDER BY 1`);
    assert.deepEqual(rows, [{ proname: 'iot_add_readings' }]);
  });

  test('officers and admins can read the coordinates in the table', async () => {
    const sql = 'SELECT latitude, longitude FROM public.iot_readings WHERE node_id = $1';
    const [row] = await selectAs(db, officer, sql, [node]);
    assert.equal(Number(row.latitude), latitude);
    assert.equal(Number(row.longitude), longitude);
  });
});

describe('the order the files run in', () => {
  test('016 stops on its first line if 015 has not been run', async () => {
    const partWay = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('015_species_rough_area.sql')),
    );
    try {
      await assert.rejects(partWay.exec(readSql('016_iot_readings.sql')), /016 needs 015/);
      const { rows } = await partWay.query("SELECT to_regclass('public.iot_devices') AS found");
      assert.deepEqual(rows, [{ found: null }]);
    } finally {
      await partWay.close();
    }
  });

  test('017 stops on its first line if 016 has not been run', async () => {
    const partWay = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('016_iot_readings.sql')),
    );
    try {
      await assert.rejects(partWay.exec(readSql('017_iot_alerts.sql')), /017 needs 016/);
      const { rows } = await partWay.query("SELECT to_regclass('public.iot_alerts') AS found");
      assert.deepEqual(rows, [{ found: null }]);
    } finally {
      await partWay.close();
    }
  });
});

describe('running 016 and 017 again', () => {
  async function catalogs() {
    const queries = [
      `SELECT tablename, policyname, cmd, roles::text[] AS roles, qual, with_check
       FROM pg_policies WHERE tablename LIKE 'iot\\_%' ORDER BY 1, 2`,
      `SELECT c.relname, c.relkind::text AS kind, c.relrowsecurity, c.reloptions,
         ARRAY(SELECT acl::text FROM unnest(c.relacl) AS acl ORDER BY 1) AS acl
       FROM pg_class AS c
       WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'iot\\_%'
       ORDER BY 1`,
      `SELECT c.relname, a.attname,
         ARRAY(SELECT acl::text FROM unnest(a.attacl) AS acl ORDER BY 1) AS acl
       FROM pg_attribute AS a
       JOIN pg_class AS c ON c.oid = a.attrelid
       WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'iot\\_%'
         AND a.attacl IS NOT NULL
       ORDER BY 1, 2`,
      `SELECT definition FROM pg_views WHERE viewname = 'iot_node_status'`,
      `SELECT p.oid::regprocedure::text AS function, p.prosecdef, p.proconfig, p.prosrc,
         ARRAY(SELECT acl::text FROM unnest(p.proacl) AS acl ORDER BY 1) AS acl
       FROM pg_proc AS p
       WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'iot\\_%'
       ORDER BY 1`,
      `SELECT tgrelid::regclass::text AS table_name, tgname, tgtype, tgenabled::text AS enabled
       FROM pg_trigger
       WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'public.iot\\_%'
       ORDER BY 1, 2`,
      `SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND conrelid::regclass::text LIKE 'public.iot\\_%'
       ORDER BY 1, 2`,
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename LIKE 'iot\\_%' ORDER BY 1`,
    ];
    const results = [];
    for (const query of queries) {
      results.push((await db.query(query)).rows);
    }
    return results;
  }

  test('ends up the same, and keeps the readings, the tokens and any tuned limits', async () => {
    const node = await newNode();
    await sendFrom(node, { tilt_degrees: 80 });
    await db.query('UPDATE public.iot_alert_limits SET quiet_minutes = 16');
    try {
      const firstTime = await catalogs();
      await db.exec(readSql('016_iot_readings.sql'));
      await db.exec(readSql('017_iot_alerts.sql'));
      assert.deepEqual(await catalogs(), firstTime);

      const { rows } = await db.query('SELECT quiet_minutes FROM public.iot_alert_limits');
      assert.deepEqual(rows, [{ quiet_minutes: 16 }]);
      assert.equal((await storedReadings(node)).length, 1);
      assert.equal((await alertsFor(node)).length, 1);
      assert.equal((await sendFrom(node)).accepted, 1);
    } finally {
      await db.query('UPDATE public.iot_alert_limits SET quiet_minutes = 15');
    }
  });
});

describe('through the stand-in, the way a device and the website do it', () => {
  const [officerLogin, adminLogin, botanistLogin, , visitorLogin] = TEST_USERS;
  const representation = { Prefer: 'return=representation' };
  let standIn;
  const tokens = {};
  let deviceToken;

  /** Calls the stand-in like supabase-js. It gives back the status and the parsed answer. */
  async function api(path, { method = 'GET', token = ANON_KEY, body, headers = {} } = {}) {
    const response = await fetch(`${standIn.url}${path}`, {
      method,
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  async function signIn(user) {
    const { body } = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: user.email, password: TEST_PASSWORD },
    });
    return body.access_token;
  }

  before(async () => {
    standIn = await startStandIn({ port: 0, log: () => {} });
    tokens.officer = await signIn(officerLogin);
    tokens.admin = await signIn(adminLogin);
    tokens.botanist = await signIn(botanistLogin);
    tokens.visitor = await signIn(visitorLogin);
  });

  after(() => standIn.close());

  function addReadings(device, token, readings) {
    return api('/rest/v1/rpc/iot_add_readings', {
      method: 'POST',
      body: { device, token, readings },
    });
  }

  test('an admin adds a device, links a node and makes a token', async () => {
    const added = await api('/rest/v1/iot_devices', {
      method: 'POST',
      token: tokens.admin,
      headers: representation,
      body: { device_id: 'HTTP-REGION', name: 'HTTP region' },
    });
    assert.equal(added.status, 201);

    const linked = await api('/rest/v1/iot_nodes?node_id=eq.NNP-IOT-01', {
      method: 'PATCH',
      token: tokens.admin,
      headers: representation,
      body: { edge_device_id: 'HTTP-REGION' },
    });
    assert.equal(linked.status, 200);
    assert.equal(linked.body.length, 1);

    const made = await api('/rest/v1/rpc/iot_make_device_token', {
      method: 'POST',
      token: tokens.admin,
      body: { device: 'HTTP-REGION' },
    });
    assert.equal(made.status, 200);
    deviceToken = made.body.token;
    assert.match(deviceToken, /^niah_device_/);

    const officerTry = await api('/rest/v1/rpc/iot_make_device_token', {
      method: 'POST',
      token: tokens.officer,
      body: { device: 'HTTP-REGION' },
    });
    assert.equal(officerTry.status, 403);
  });

  test('the publishable key adds readings with the token, and nothing without it', async () => {
    const sent = {
      reading_id: 'http-1',
      node_id: 'NNP-IOT-01',
      recorded_at: new Date().toISOString(),
      ...calm,
      tilt_degrees: 80,
    };
    const first = await addReadings('HTTP-REGION', deviceToken, [sent]);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, { accepted: 1, duplicates: 0, refused: [] });

    const again = await addReadings('HTTP-REGION', deviceToken, [sent]);
    assert.deepEqual(again.body, { accepted: 0, duplicates: 1, refused: [] });

    const wrong = await addReadings('HTTP-REGION', 'wrong', [sent]);
    assert.equal(wrong.status, 401);
    const unknown = await addReadings('NO-SUCH-DEVICE', deviceToken, [sent]);
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.message, wrong.body.message);

    const tooMany = await addReadings('HTTP-REGION', deviceToken, Array(101).fill(sent));
    assert.equal(tooMany.status, 400);
  });

  test('the publishable key reads nothing back', async () => {
    for (const table of ['iot_readings', 'iot_alerts', 'iot_devices', 'iot_device_tokens', 'iot_node_status']) {
      const { status } = await api(`/rest/v1/${table}?select=*`);
      assert.equal(status, 401, table);
    }
  });

  test('officers read readings and alerts, and a botanist or visitor gets nothing', async () => {
    for (const path of ['iot_readings?node_id=eq.NNP-IOT-01', 'iot_alerts?node_id=eq.NNP-IOT-01']) {
      const staff = await api(`/rest/v1/${path}`, { token: tokens.officer });
      assert.equal(staff.status, 200);
      assert.equal(staff.body.length, 1, path);
      for (const token of [tokens.botanist, tokens.visitor]) {
        const refused = await api(`/rest/v1/${path}`, { token });
        assert.deepEqual(refused.body, [], path);
      }
    }
    const status = await api('/rest/v1/iot_node_status?node_id=eq.NNP-IOT-01', {
      token: tokens.officer,
    });
    assert.equal(Number(status.body[0].tilt_degrees), 80);
  });

  test('an officer acknowledges and resolves through the API, and a botanist cannot', async () => {
    const counts = await api('/rest/v1/rpc/iot_check_alerts', {
      method: 'POST',
      token: tokens.officer,
      body: {},
    });
    assert.deepEqual(counts.body, { urgent: 1, open: 1 });

    const list = await api('/rest/v1/iot_alerts?status=eq.open', { token: tokens.officer });
    const alert = list.body[0].id;

    const refused = await api('/rest/v1/rpc/iot_acknowledge_alert', {
      method: 'POST',
      token: tokens.botanist,
      body: { alert },
    });
    assert.equal(refused.status, 403);
    const noCount = await api('/rest/v1/rpc/iot_check_alerts', {
      method: 'POST',
      token: tokens.visitor,
      body: {},
    });
    assert.equal(noCount.status, 403);

    const seen = await api('/rest/v1/rpc/iot_acknowledge_alert', {
      method: 'POST',
      token: tokens.officer,
      body: { alert },
    });
    assert.deepEqual(seen.body, { id: alert, status: 'acknowledged' });
    const done = await api('/rest/v1/rpc/iot_resolve_alert', {
      method: 'POST',
      token: tokens.officer,
      body: { alert },
    });
    assert.deepEqual(done.body, { id: alert, status: 'resolved' });

    const after = await api(`/rest/v1/iot_alerts?id=eq.${alert}`, { token: tokens.officer });
    assert.equal(after.body[0].acknowledged_by_name, officerLogin.name);
    assert.equal(after.body[0].resolved_by_name, officerLogin.name);
  });
});

describe('the node simulator', () => {
  const SIMULATOR = fileURLToPath(new URL('../../iot/node-simulator/node-simulator.mjs', import.meta.url));
  const [officerLogin] = TEST_USERS;
  let standIn;
  let officerToken;

  /** Runs the simulator on its own, the way someone would from a terminal. */
  function simulate(args, env = {}) {
    return new Promise((resolve) => {
      execFile(
        process.execPath,
        [SIMULATOR, ...args],
        { env: { PATH: process.env.PATH, IOT_SUPABASE_URL: standIn.url, ...env }, timeout: 20000 },
        (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }),
      );
    });
  }

  async function officerGets(path) {
    const response = await fetch(`${standIn.url}/rest/v1/${path}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${officerToken}` },
    });
    return response.json();
  }

  async function openAlerts(kind) {
    return officerGets(`iot_alerts?node_id=eq.NNP-IOT-01&kind=eq.${kind}&status=eq.open`);
  }

  before(async () => {
    standIn = await startStandIn({ port: 0, log: () => {} });
    const response = await fetch(`${standIn.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: officerLogin.email, password: TEST_PASSWORD }),
    });
    officerToken = (await response.json()).access_token;
  });

  after(() => standIn.close());

  test('a calm round adds a reading from each node and raises nothing', async () => {
    const { code, stdout } = await simulate(['--scenario', 'normal']);
    assert.equal(code, 0);
    assert.match(stdout, /added 3, already there 0, turned down 0/);
    assert.match(stdout, /made up/);

    const alerts = await officerGets('iot_alerts?select=id');
    assert.deepEqual(alerts, []);
    const stored = await officerGets('iot_readings?select=node_id');
    assert.equal(stored.length, 3);
  });

  test('a disturbance raises an urgent alert on the first node only', async () => {
    const { code } = await simulate(['--scenario', 'disturbance']);
    assert.equal(code, 0);

    const alerts = await openAlerts('disturbance');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].severity, 'urgent');
    const others = await officerGets('iot_alerts?node_id=neq.NNP-IOT-01&select=id');
    assert.deepEqual(others, []);
  });

  test('sending the same readings again only counts as already there', async () => {
    const { code, stdout } = await simulate(['--scenario', 'resend']);
    assert.equal(code, 0);
    assert.match(stdout, /added 3, already there 0, turned down 0/);
    assert.match(stdout, /added 0, already there 3, turned down 0/);
  });

  test('a value no sensor could read is turned down, and says why', async () => {
    const { code, stdout } = await simulate(['--scenario', 'bad-value']);
    assert.equal(code, 0);
    assert.match(stdout, /added 2, already there 0, turned down 1/);
    assert.match(stdout, /humidity_percent_in_range/);
  });

  test('a node that stops sending gets a quiet alert from the next check', async () => {
    // A backdated reading is the only way to the first node having gone quiet without waiting 15
    // minutes. It has its own stand-in, because the other tests here just heard from that node.
    const fresh = await startStandIn({ port: 0, log: () => {} });
    try {
      const { code } = await simulate(['--scenario', 'quiet'], { IOT_SUPABASE_URL: fresh.url });
      assert.equal(code, 0);

      const login = await fetch(`${fresh.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: officerLogin.email, password: TEST_PASSWORD }),
      });
      const { access_token: token } = await login.json();
      const headers = {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const check = await fetch(`${fresh.url}/rest/v1/rpc/iot_check_alerts`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      assert.equal(check.status, 200);

      const alerts = await fetch(`${fresh.url}/rest/v1/iot_alerts?kind=eq.quiet`, { headers });
      const quiet = await alerts.json();
      assert.deepEqual(quiet.map((alert) => alert.node_id), ['NNP-IOT-01']);
    } finally {
      await fresh.close();
    }
  });

  test('it stops at a wrong token and says so', async () => {
    const { code, stderr } = await simulate(['--scenario', 'normal'], { IOT_DEVICE_TOKEN: 'not-the-token' });
    assert.equal(code, 1);
    assert.match(stderr, /turned this device down/);
  });

  test('it stops at a database without the IoT SQL and says what to run', async () => {
    const older = await startStandIn({ port: 0, log: () => {}, sqlThrough: '015' });
    try {
      const { code, stderr } = await simulate(['--scenario', 'normal'], { IOT_SUPABASE_URL: older.url });
      assert.equal(code, 1);
      assert.match(stderr, /016_iot_readings\.sql/);

      const table = await fetch(`${older.url}/rest/v1/iot_readings`, { headers: { apikey: ANON_KEY } });
      assert.equal(table.status, 404);
      assert.equal((await table.json()).code, 'PGRST205');
    } finally {
      await older.close();
    }
  });

  test('it refuses anything that is not this computer unless told, and always refuses plain http', async () => {
    // A closed port on a made up test host, so nothing can answer even if the check failed
    const host = { IOT_SUPABASE_URL: 'https://niah-simulator-test.example.test' };
    const refused = await simulate(['--scenario', 'normal'], host);
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /isn't this computer/);
    assert.doesNotMatch(refused.stdout, /Sending to/);

    const noSettings = await simulate(['--scenario', 'normal', '--allow-remote'], host);
    assert.equal(noSettings.code, 1);
    assert.match(noSettings.stderr, /The defaults only work on the stand-in/);
    assert.doesNotMatch(noSettings.stdout, /Sending to/);

    const plainHttp = await simulate(['--scenario', 'normal', '--allow-remote'], {
      IOT_SUPABASE_URL: 'http://niah-simulator-test.example.test',
    });
    assert.equal(plainHttp.code, 1);
    assert.match(plainHttp.stderr, /has to use https/);
    assert.doesNotMatch(plainHttp.stdout, /Sending to/);
  });

  test('it turns down a scenario it does not know', async () => {
    const { code, stderr } = await simulate(['--scenario', 'made-up']);
    assert.equal(code, 1);
    assert.match(stderr, /no scenario called made-up/);
  });
});

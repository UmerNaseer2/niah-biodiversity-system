// Cuts the connection in the middle of an upload and checks nothing is lost or saved twice once the
// phone or the edge tries again. A small proxy sits between the sender and the stand-in and drops
// the connection at one of two points:
//
//   before the server has the whole request, so nothing should be saved yet
//   after the server has saved it but before the answer gets back, so the sender thinks it failed
//
// The second is the hard one. The phone then sends the same record again and has to treat the
// "already there" answer as done (classifyUpload in mobile/src/sync/upload-row.ts), and the edge
// sends the same readings again and edge-com must not store them twice.
//
// This is a lab check on the stand-in, not a field test with a real weak signal.
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { connect, createServer } from 'node:net';
import { after, before, describe, test } from 'node:test';
import {
  ANON_KEY,
  TEST_DEVICE_ID,
  TEST_DEVICE_TOKEN,
  TEST_PASSWORD,
  TEST_USERS,
  startStandIn,
} from './stand-in.js';

let standIn;
let proxy;
const officer = TEST_USERS.find((user) => user.role === 'conservation_officer');

/**
 * A proxy that passes everything through, unless cut is set:
 *   'request'  sends only the first half of the request on and then drops both sides
 *   'answer'   sends the whole request on and drops the sender as soon as the answer starts
 */
function startProxy(target) {
  const state = { cut: null, cuts: 0 };
  const server = createServer((client) => {
    const upstream = connect(Number(target.port), target.hostname);
    // Read at each chunk, since fetch keeps a connection open between requests
    let sent = 0;
    client.on('data', (chunk) => {
      if (state.cut === 'request') {
        // Headers and part of the body only
        if (sent === 0) {
          upstream.write(chunk.subarray(0, Math.floor(chunk.length / 2)));
          sent += 1;
          state.cuts += 1;
          upstream.destroy();
          client.destroy();
        }
        return;
      }
      upstream.write(chunk);
    });
    upstream.on('data', (chunk) => {
      if (state.cut === 'answer') {
        state.cuts += 1;
        client.destroy();
        upstream.destroy();
        return;
      }
      client.write(chunk);
    });
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('end', () => upstream.end());
    upstream.on('end', () => client.end());
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        state,
        close: () =>
          new Promise((done) => {
            server.close(done);
            server.unref();
          }),
      });
    });
  });
}

before(async () => {
  standIn = await startStandIn({ port: 0, log: () => {}, sensorData: false });
  proxy = await startProxy(new URL(standIn.url));
});

after(async () => {
  await proxy?.close();
  await standIn?.close();
});

async function tokenFor(user) {
  const res = await fetch(`${standIn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: TEST_PASSWORD }),
  });
  return (await res.json()).access_token;
}

/** Sends one record the way the phone does (supabase.from('records').insert(row)). */
async function sendRecord(base, token, row) {
  const res = await fetch(`${base}/rest/v1/records`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** The phone's own reading of the answer, copied from classifyUpload. */
function phoneSees(answer) {
  if (answer.status < 300) return 'synced';
  if (answer.body?.code === '23505' && answer.body.message?.includes('"records_pkey"')) {
    return 'synced';
  }
  return `problem ${answer.status} ${answer.body?.code}`;
}

// Each ID starts differently, since the tag code is the first 6 characters and has to be unique
async function countRecords(id) {
  const { rows } = await standIn.db.query(
    'SELECT count(*)::int AS n FROM public.records WHERE id = $1',
    [id],
  );
  return rows[0].n;
}

function recordRow(id) {
  return {
    id,
    species_name: 'Dryobalanops aromatica',
    species_slug: null,
    common_name: null,
    height_m: 3,
    condition: 'healthy',
    notes: 'Cut upload check.',
    gps: { lat: 3.81, lng: 113.78, accuracyM: 5, capturedAt: '2026-11-18T03:00:00Z' },
    photo_count: 0,
    recorded_at: '2026-11-18T03:00:00Z',
  };
}

describe('a record from the phone', () => {
  test('cut before the server has it: nothing saved, the next try saves it once', async () => {
    const token = await tokenFor(officer);
    const id = 'c1700000-0000-4000-8000-000000000001';
    proxy.state.cut = 'request';
    await assert.rejects(sendRecord(proxy.url, token, recordRow(id)));
    proxy.state.cut = null;
    assert.equal(await countRecords(id), 0);

    const again = await sendRecord(proxy.url, token, recordRow(id));
    assert.equal(phoneSees(again), 'synced');
    assert.equal(await countRecords(id), 1);
  });

  test('cut after the server saved it: the next try is "already there", still one copy', async () => {
    const token = await tokenFor(officer);
    const id = 'c2700000-0000-4000-8000-000000000002';
    proxy.state.cut = 'answer';
    await assert.rejects(sendRecord(proxy.url, token, recordRow(id)));
    proxy.state.cut = null;
    // The server did save it, the phone just never heard
    assert.equal(await countRecords(id), 1);

    const again = await sendRecord(proxy.url, token, recordRow(id));
    assert.equal(again.status, 409);
    assert.equal(phoneSees(again), 'synced');
    assert.equal(await countRecords(id), 1);
  });

  test('ten cut tries in a row then a good one: one copy and nothing lost', async () => {
    const token = await tokenFor(officer);
    const ids = Array.from(
      { length: 10 },
      (_, i) => `d${i}c70000-0000-4000-8000-0000000000${String(i + 10)}`,
    );
    for (const [i, id] of ids.entries()) {
      proxy.state.cut = i % 2 === 0 ? 'request' : 'answer';
      await assert.rejects(sendRecord(proxy.url, token, recordRow(id)));
    }
    proxy.state.cut = null;
    for (const id of ids) {
      assert.equal(phoneSees(await sendRecord(proxy.url, token, recordRow(id))), 'synced');
      assert.equal(await countRecords(id), 1, id);
    }
  });
});

describe('readings from the edge', () => {
  let node;

  before(async () => {
    const { rows } = await standIn.db.query(
      'SELECT node_id FROM public.iot_nodes ORDER BY node_id LIMIT 1',
    );
    node = rows[0].node_id;
  });

  function batch(bootId, count) {
    const now = Math.floor(Date.now() / 1000);
    const rows = Array.from({ length: count }, (_, i) => [
      i + 1, // seq
      now - (count - i) * 60, // measured
      1, // lag
      27.1, // temp_c
      80, // hum_pct
      2400, // soil
      4095, // rain
      120.5, // distance
      120, // baseline_cm
      0, // beep_on
      -61, // rssi
      0, // motion
    ]);
    return {
      edge_id: TEST_DEVICE_ID,
      nodes: [{ node_id: node, boot_id: bootId, rows }],
      boots: [
        { node_id: node, boot_id: bootId, lat: 3.81, lon: 113.78, at: new Date((now - 3600) * 1000).toISOString() },
      ],
    };
  }

  function sendBatch(base, body) {
    return fetch(`${base}/functions/v1/edge-com`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'x-edge-key': TEST_DEVICE_TOKEN,
      },
      body: gzipSync(JSON.stringify(body)),
    });
  }

  async function countReadings(bootId) {
    const { rows } = await standIn.db.query(
      'SELECT count(*)::int AS n, count(DISTINCT seq)::int AS seqs FROM public.iot_readings WHERE node_id = $1 AND boot_id = $2',
      [node, bootId],
    );
    return rows[0];
  }

  test('cut after edge-com saved the batch: sending it again adds nothing twice', async (t) => {
    if (!standIn.edgeCom) return t.skip('edge-com needs Node 22.13 or newer');
    const bootId = 2_000_000_001;
    proxy.state.cut = 'answer';
    await assert.rejects(sendBatch(proxy.url, batch(bootId, 20)));
    proxy.state.cut = null;
    assert.deepEqual(await countReadings(bootId), { n: 20, seqs: 20 });

    const again = await sendBatch(proxy.url, batch(bootId, 20));
    assert.equal(again.status, 200, await again.text());
    assert.deepEqual(await countReadings(bootId), { n: 20, seqs: 20 });
  });

  test('cut before edge-com had the batch: nothing saved, the next try saves all of it', async (t) => {
    if (!standIn.edgeCom) return t.skip('edge-com needs Node 22.13 or newer');
    const bootId = 2_000_000_002;
    proxy.state.cut = 'request';
    await assert.rejects(sendBatch(proxy.url, batch(bootId, 20)));
    proxy.state.cut = null;
    assert.deepEqual(await countReadings(bootId), { n: 0, seqs: 0 });

    const again = await sendBatch(proxy.url, batch(bootId, 20));
    assert.equal(again.status, 200, await again.text());
    assert.deepEqual(await countReadings(bootId), { n: 20, seqs: 20 });
  });
});

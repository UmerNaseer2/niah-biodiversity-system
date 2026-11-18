// Sends one saturated soil reading to a running stand-in's edge-com, the way cloud-com.py sends a
// quick alert, and prints the time it was sent. Used to time how long an alert takes to show on the
// sensors page: note the time printed here and the time the alert shows in the browser.
//
//   node send-alert.js [node id]    (NNP-IOT-03 if left out)
//
// The stand-in has to be running on STAND_IN_PORT (54321 if not set). The reading is made up, like
// the one tools/fake-thing.py sends with --flood-at.
import { gzipSync } from 'node:zlib';
import { TEST_DEVICE_ID, TEST_DEVICE_TOKEN } from './stand-in.js';

const port = Number(process.env.STAND_IN_PORT || 54321);
const node = process.argv[2] ?? 'NNP-IOT-03';
const now = Math.floor(Date.now() / 1000);
const bootId = 3_000_000_000 + (now % 1_000_000);

const batch = {
  edge_id: TEST_DEVICE_ID,
  nodes: [
    {
      node_id: node,
      boot_id: bootId,
      // seq, measured, lag, temp_c, hum_pct, soil, rain, distance, baseline_cm, beep_on, rssi, motion
      rows: [[1, now, 0, 28.1, 76, 1450, 4095, 120.4, 120.4, 0, -62, 0]],
    },
  ],
  boots: [],
};

const sentAt = new Date();
const res = await fetch(`http://127.0.0.1:${port}/functions/v1/edge-com`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Encoding': 'gzip',
    'x-edge-key': TEST_DEVICE_TOKEN,
  },
  body: gzipSync(JSON.stringify(batch)),
});
const took = Date.now() - sentAt.getTime();
console.log(`Sent a saturated soil reading for ${node} at ${sentAt.toISOString()} (${sentAt.getTime()})`);
console.log(`edge-com answered ${res.status} in ${took} ms: ${await res.text()}`);
process.exit(res.ok ? 0 : 1);

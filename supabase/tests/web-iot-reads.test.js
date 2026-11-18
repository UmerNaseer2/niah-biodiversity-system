// Checks the column lists the website's sensor pages ask Supabase for (web/src/lib/iot.ts) against
// the real tables and views. A column in a list that no SQL file makes breaks the whole read, so the
// Sensors, Overview and Ecology pages would show nothing. The lists are read from that file, so a
// column added there has to get past this test too.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { addUser, newDatabase, selectAs } from './harness.js';

const IOT_FILE = new URL('../../web/src/lib/iot.ts', import.meta.url);
const IOT_SOURCE = readFileSync(IOT_FILE, 'utf8');

// Which table or view each list is read from (the .from() next to each .select() in web/src/app).
const READS = {
  NODE_COLUMNS: 'iot_node_status',
  SETTINGS_COLUMNS: 'iot_nodes',
  ALERT_COLUMNS: 'iot_alerts',
  HISTORY_COLUMNS: 'iot_readings',
  COMMAND_COLUMNS: 'iot_commands',
  DEVICE_COLUMNS: 'iot_devices',
  POSITION_COLUMNS: 'iot_boots',
  DAILY_COLUMNS: 'iot_daily_summary',
};

/** The columns in one of the lists in iot.ts. */
function columnsOf(name) {
  const match = IOT_SOURCE.match(new RegExp(`export const ${name} =\\s*"([^"]+)"`));
  assert.ok(match, `iot.ts has no ${name}`);
  return match[1].split(',').map((column) => column.trim());
}

let db;
let officer;

before(async () => {
  db = await newDatabase();
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
});

after(async () => {
  await db.close();
});

describe('the sensor pages on the website', () => {
  test('every column list in iot.ts is checked here', () => {
    const lists = [...IOT_SOURCE.matchAll(/export const ([A-Z_]+_COLUMNS) =/g)].map((m) => m[1]);
    assert.deepEqual(lists.sort(), Object.keys(READS).sort());
  });

  for (const [name, table] of Object.entries(READS)) {
    test(`${name} only asks ${table} for columns it has`, async () => {
      const list = columnsOf(name);
      const rows = await selectAs(db, officer, `SELECT ${list.join(', ')} FROM public.${table} LIMIT 1`);
      if (rows.length > 0) assert.deepEqual(Object.keys(rows[0]).sort(), [...list].sort());
    });
  }
});

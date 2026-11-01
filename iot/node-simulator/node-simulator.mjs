#!/usr/bin/env node
// Pretends to be an edge device, so the dashboard and the threat rules can be tried with no
// hardware. It sends made up readings through iot_add_readings, the same call the real edge device
// makes. It runs against the Supabase stand-in unless told otherwise, and the defaults here only
// work there. iot/README.md says how to use it.
//
//   node iot/node-simulator/node-simulator.mjs --scenario disturbance
//
// Settings come from the environment, so a real token never goes in a file or your shell history:
//   IOT_SUPABASE_URL  where to send (the stand-in on this computer unless you say)
//   IOT_ANON_KEY      the project's publishable key
//   IOT_DEVICE_ID     the edge device to send as
//   IOT_DEVICE_TOKEN  that device's token, from the Devices page
//   IOT_NODE_IDS      the nodes on that device, split by commas

const STAND_IN = {
  url: 'http://127.0.0.1:54321',
  anonKey: 'stand-in-anon-key',
  deviceId: 'NNP-EDGE-01',
  deviceToken: 'stand-in-device-token',
  nodeIds: 'NNP-IOT-01,NNP-IOT-02,NNP-IOT-03',
};

// What each scenario changes on the first node. The other nodes stay calm, so the page shows the
// difference.
const SCENARIOS = {
  normal: { what: 'all nodes calm', first: {} },
  disturbance: {
    what: 'the first node is knocked over',
    first: { tilt_degrees: 70, shock_g: 6, distance_change_cm: 45 },
  },
  motion: { what: 'something moves near the first node', first: { motion_detected: true } },
  dry: { what: 'the soil at the first node dries out', first: { soil_moisture_percent: 8 } },
  wet: { what: 'the soil at the first node floods', first: { soil_moisture_percent: 96 } },
  hot: { what: 'the first node reads too hot', first: { temperature_c: 46 } },
  cold: { what: 'the first node reads too cold', first: { temperature_c: 9 } },
  'low-battery': { what: 'the first node runs low on battery', first: { battery_percent: 12 } },
  quiet: { what: 'the first node last sent 20 minutes ago, then stopped', first: {} },
  resend: { what: 'every reading is sent twice, like after a dropped connection', first: {} },
  'bad-value': { what: 'the first node sends a value no sensor could read', first: { humidity_percent: 300 } },
};

const USAGE = `Usage: node node-simulator.mjs [options]

  --scenario <name>   ${Object.keys(SCENARIOS).join(', ')} (normal unless you say)
  --count <n>         how many rounds to send (1 unless --interval is given, then it keeps going)
  --interval <secs>   seconds between rounds
  --allow-remote      let it send to something that isn't this computer
  --help              show this
`;

function readOptions(args) {
  const options = { scenario: 'normal', count: null, interval: null, allowRemote: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--allow-remote') {
      options.allowRemote = true;
    } else if (arg === '--scenario') {
      options.scenario = args[++i];
    } else if (arg === '--count') {
      options.count = Number(args[++i]);
    } else if (arg === '--interval') {
      options.interval = Number(args[++i]);
    } else {
      stop(`I don't know ${arg}.\n\n${USAGE}`);
    }
  }
  if (!Object.hasOwn(SCENARIOS, options.scenario)) {
    stop(`There's no scenario called ${options.scenario}.\n\n${USAGE}`);
  }
  if (options.count !== null && !(Number.isInteger(options.count) && options.count > 0)) {
    stop('--count has to be a whole number above 0.');
  }
  if (options.interval !== null && !(options.interval > 0)) {
    stop('--interval has to be a number of seconds above 0.');
  }
  return options;
}

function stop(message) {
  console.error(message);
  process.exit(1);
}

function isThisComputer(url) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function readSettings(allowRemote) {
  const env = process.env;
  let url;
  try {
    url = new URL(env.IOT_SUPABASE_URL || STAND_IN.url);
  } catch {
    stop('IOT_SUPABASE_URL is not a web address.');
  }

  const local = isThisComputer(url);
  if (!local && !allowRemote) {
    stop(`${url.hostname} isn't this computer. These are made up readings, so they'd show up as real ones there. Add --allow-remote if you're sure.`);
  }
  if (!local && url.protocol !== 'https:') {
    stop('Anything that is not this computer has to use https, because the token goes in the request.');
  }
  if (!local && !(env.IOT_ANON_KEY && env.IOT_DEVICE_ID && env.IOT_DEVICE_TOKEN && env.IOT_NODE_IDS)) {
    stop('Set IOT_ANON_KEY, IOT_DEVICE_ID, IOT_DEVICE_TOKEN and IOT_NODE_IDS. The defaults only work on the stand-in.');
  }

  return {
    url: url.origin,
    anonKey: env.IOT_ANON_KEY || STAND_IN.anonKey,
    deviceId: env.IOT_DEVICE_ID || STAND_IN.deviceId,
    deviceToken: env.IOT_DEVICE_TOKEN || STAND_IN.deviceToken,
    nodeIds: (env.IOT_NODE_IDS || STAND_IN.nodeIds).split(',').map((id) => id.trim()).filter(Boolean),
  };
}

/** A small wobble, so the history chart isn't a flat line. */
function around(middle, spread) {
  return Math.round((middle + (Math.random() * 2 - 1) * spread) * 100) / 100;
}

function calmValues() {
  return {
    temperature_c: around(26, 1.5),
    humidity_percent: around(78, 4),
    soil_moisture_percent: around(55, 5),
    rain_percent: around(5, 5),
    battery_percent: around(85, 3),
    tilt_degrees: around(2, 1),
    shock_g: around(1, 0.05),
    distance_change_cm: around(1, 1),
    motion_detected: false,
  };
}

// So running it twice doesn't use the same reading IDs
const runId = Date.now().toString(36);
let sequence = 0;

function makeReading(node, changes, recordedAt = new Date()) {
  sequence += 1;
  return {
    reading_id: `${node}-sim-${runId}-${sequence}`,
    node_id: node,
    recorded_at: recordedAt.toISOString(),
    ...calmValues(),
    ...changes,
  };
}

async function send(settings, readings) {
  const response = await fetch(`${settings.url}/rest/v1/rpc/iot_add_readings`, {
    method: 'POST',
    headers: {
      apikey: settings.anonKey,
      Authorization: `Bearer ${settings.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      device: settings.deviceId,
      token: settings.deviceToken,
      readings,
    }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function say(answer) {
  const { accepted, duplicates, refused } = answer;
  console.log(`  added ${accepted}, already there ${duplicates}, turned down ${refused.length}`);
  for (const { reading_id: id, why } of refused) {
    console.log(`    turned down ${id}: ${why}`);
  }
}

function roundOf(settings, scenario, round) {
  const [first, ...others] = settings.nodeIds;
  const calm = others.map((node) => makeReading(node, {}));
  if (scenario === 'quiet') {
    // Only the first round has the old reading. Later rounds leave the first node out.
    if (round > 1) return calm;
    return [makeReading(first, {}, new Date(Date.now() - 20 * 60_000)), ...calm];
  }
  return [makeReading(first, SCENARIOS[scenario].first), ...calm];
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  const settings = readSettings(options.allowRemote);
  if (settings.nodeIds.length === 0) stop('IOT_NODE_IDS has no nodes in it.');

  const rounds = options.count ?? (options.interval ? Infinity : 1);
  console.log(`Sending to ${settings.url} as ${settings.deviceId}: ${SCENARIOS[options.scenario].what}.`);
  console.log('These readings are made up.');

  for (let round = 1; round <= rounds; round += 1) {
    const readings = roundOf(settings, options.scenario, round);
    try {
      const { status, body } = await send(settings, readings);
      if (status === 401 || status === 403) {
        stop(`The database turned this device down: ${body?.message ?? status}. Check the device ID and the token.`);
      }
      if (status === 404) {
        stop('iot_add_readings is not there, so 016_iot_readings.sql has not been run on this database.');
      }
      if (status !== 200) {
        stop(`The database answered ${status}: ${body?.message ?? 'no reason given'}`);
      }
      console.log(`Round ${round}: sent ${readings.length}`);
      say(body);

      if (options.scenario === 'resend') {
        console.log('  sending the same readings again');
        const again = await send(settings, readings);
        say(again.body);
      }
    } catch (error) {
      // What a dropped connection looks like. Keep trying if it's running on a timer.
      console.error(`Round ${round}: couldn't reach ${settings.url} (${error.cause?.code ?? error.message})`);
      if (!options.interval) process.exit(1);
    }

    if (round < rounds) {
      await new Promise((resolve) => setTimeout(resolve, (options.interval ?? 1) * 1000));
    }
  }
}

await main();

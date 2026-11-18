import type { SupabaseClient } from '@supabase/supabase-js';
import * as Network from 'expo-network';

import { NEARBY_READ_LIMIT } from '@/lib/sensor-alerts';
import { ALERTS_READ_LIMIT, acknowledgeSensorAlert, loadSensorAlerts } from '@/sync/sensor-alerts';

jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn() }));

type Answer = {
  data: unknown;
  error: { message: string; code: string } | null;
  status: number;
};

const OK = (data: unknown): Answer => ({ data, error: null, status: 200 });
const ERROR = (code: string, status = 400): Answer => ({
  data: null,
  error: { message: 'Something went wrong', code },
  status,
});
const NO_ANSWER: Answer = {
  data: null,
  error: { message: 'Failed to fetch', code: '' },
  status: 0,
};

// The first node has a position from a power-up, the second only has the spot saved on it, and
// the third has neither.
const NODE_1 = { latitude: 3.8157, longitude: 113.7786 };
const NODE_2 = { latitude: 3.82, longitude: 113.79 };
const METRES_PER_DEGREE = 111_195;

function alertRow(id: number, nodeId: string, severity: string, recordedAt: string) {
  return {
    id,
    node_id: nodeId,
    node_name: `Node ${nodeId.slice(-1)}`,
    type: severity === 'urgent' ? 'SATURATED' : 'RAIN',
    severity,
    recorded_at: recordedAt,
  };
}

const ALERTS = [
  alertRow(2, 'node-2', 'routine', '2026-11-18T03:00:00Z'),
  alertRow(1, 'node-1', 'urgent', '2026-11-18T01:00:00Z'),
  alertRow(3, 'node-3', 'routine', '2026-11-18T02:00:00Z'),
  // A row the phone can't read is left out.
  { id: 9, node_id: 'node-1', type: 'FLOOD', severity: 'urgent', recorded_at: '2026-11-18' },
];

function plantRow(id: string, near: { latitude: number; longitude: number }, metres: number) {
  return {
    id,
    tag_code: `NNP-${id.toUpperCase()}`,
    species_name: 'Nepenthes rafflesiana',
    common_name: null,
    status: 'approved',
    gps: { lat: near.latitude + metres / METRES_PER_DEGREE, lng: near.longitude },
  };
}

type Tables = Record<string, Answer | ((calls: unknown[][]) => Answer)>;

/**
 * A fake Supabase client. Each table gives back its answer however it's asked, and every call on
 * it is written down so the tests can check what was asked for.
 */
function fakeServer({
  rpc = {},
  tables = {},
}: {
  rpc?: Record<string, Answer | Error>;
  tables?: Tables;
}) {
  const rpcCalls: [string, unknown][] = [];
  const reads: { table: string; calls: unknown[][] }[] = [];
  const supabase = {
    rpc(name: string, args?: unknown) {
      rpcCalls.push([name, args]);
      const answer = rpc[name] ?? OK(null);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    from(table: string) {
      const calls: unknown[][] = [];
      reads.push({ table, calls });
      const builder: Record<string, unknown> = {
        then(resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) {
          const answer = tables[table] ?? OK([]);
          return Promise.resolve(typeof answer === 'function' ? answer(calls) : answer).then(
            resolve,
            reject,
          );
        },
      };
      for (const method of ['select', 'eq', 'neq', 'is', 'in', 'not', 'gte', 'lte', 'order']) {
        builder[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          return builder;
        };
      }
      builder.limit = (...args: unknown[]) => {
        calls.push(['limit', ...args]);
        return builder;
      };
      return builder;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, rpcCalls, reads };
}

/** A server with three alerts on it, and plants near the first two nodes. */
function fullServer(overrides: { rpc?: Record<string, Answer | Error>; tables?: Tables } = {}) {
  return fakeServer({
    rpc: { iot_check_alerts: OK({ urgent: 1, open: 3 }), ...overrides.rpc },
    tables: {
      iot_alerts: OK(ALERTS),
      iot_boots: OK([{ node_id: 'node-1', ...NODE_1, position_at: '2026-11-01T00:00:00Z' }]),
      iot_nodes: OK([{ node_id: 'node-2', ...NODE_2 }]),
      // Every plant in the box comes back, and the phone works out which are close enough.
      records_staff: OK([
        plantRow('a00001', NODE_1, 60),
        plantRow('a00002', NODE_1, 15),
        plantRow('b00001', NODE_2, 30),
      ]),
      ...overrides.tables,
    },
  });
}

function online(isConnected: boolean | null = true) {
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValue({ isConnected } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  online();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.mocked(console.warn).mockRestore();
});

describe('loadSensorAlerts', () => {
  it('asks the server to check first, then reads the alerts that need someone', async () => {
    const { supabase, rpcCalls, reads } = fullServer();
    await loadSensorAlerts(supabase);
    expect(rpcCalls[0]).toEqual(['iot_check_alerts', undefined]);
    const alerts = reads.find((read) => read.table === 'iot_alerts');
    expect(alerts?.calls).toEqual([
      ['select', 'id, node_id, node_name, type, severity, recorded_at'],
      ['eq', 'status', 'open'],
      ['is', 'cleared_at', null],
      ['eq', 'from_backlog', false],
      ['order', 'recorded_at', { ascending: false }],
      ['limit', ALERTS_READ_LIMIT],
    ]);
  });

  it('gives back the alerts urgent first, each with the tagged plants near its node', async () => {
    const { supabase } = fullServer();
    const result = await loadSensorAlerts(supabase);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') {
      return;
    }
    expect(result.alerts.map((alert) => alert.id)).toEqual([1, 2, 3]);
    expect(result.total).toBe(3);
    const [first, second, third] = result.alerts;
    expect(first.nearby).toEqual({
      kind: 'found',
      plants: [
        expect.objectContaining({ tagCode: 'NNP-A00002', distanceM: 15 }),
        expect.objectContaining({ tagCode: 'NNP-A00001', distanceM: 60 }),
      ],
      maybeMore: false,
    });
    // The second node's spot comes from iot_nodes, since it has no position from a power-up.
    expect(second.nearby).toEqual({
      kind: 'found',
      plants: [expect.objectContaining({ tagCode: 'NNP-B00001', distanceM: 30 })],
      maybeMore: false,
    });
    expect(third.nearby).toEqual({ kind: 'no-position' });
  });

  it('only reads plants that are not rejected, inside a box around the node', async () => {
    const { supabase, reads } = fullServer();
    await loadSensorAlerts(supabase);
    const plants = reads.filter((read) => read.table === 'records_staff');
    // One read for each node with a spot. The third node has none.
    expect(plants).toHaveLength(2);
    const calls = plants[0].calls;
    expect(calls[0]).toEqual(['select', 'id, tag_code, species_name, common_name, status, gps']);
    expect(calls).toContainEqual(['neq', 'status', 'rejected']);
    const south = calls.find((call) => call[0] === 'gte' && call[1] === 'gps->lat')?.[2];
    const north = calls.find((call) => call[0] === 'lte' && call[1] === 'gps->lat')?.[2];
    expect(Number(south)).toBeLessThan(Number(north));
    expect(calls).toContainEqual(['limit', NEARBY_READ_LIMIT]);
  });

  it('says there may be nearer plants when the read hits its limit', async () => {
    const rows = Array.from({ length: NEARBY_READ_LIMIT }, (_, index) =>
      plantRow(`c${String(index).padStart(5, '0')}`, NODE_1, 500),
    );
    const { supabase } = fullServer({ tables: { records_staff: OK(rows) } });
    const result = await loadSensorAlerts(supabase);
    expect(result.kind === 'loaded' && result.alerts[0].nearby).toEqual({
      kind: 'found',
      plants: [],
      maybeMore: true,
    });
  });

  it('still shows the alert when the plants near it could not be read', async () => {
    const { supabase } = fullServer({ tables: { records_staff: ERROR('XX000', 500) } });
    const result = await loadSensorAlerts(supabase);
    expect(result.kind === 'loaded' && result.alerts[0].nearby).toEqual({ kind: 'failed' });
  });

  it('still shows the alert when the node spots could not be read, like without 026', async () => {
    const { supabase } = fullServer({
      tables: { iot_boots: ERROR('42501', 403), iot_nodes: ERROR('42703') },
    });
    const result = await loadSensorAlerts(supabase);
    expect(result.kind).toBe('loaded');
    expect(result.kind === 'loaded' && result.alerts.map((alert) => alert.nearby)).toEqual([
      { kind: 'no-position' },
      { kind: 'no-position' },
      { kind: 'no-position' },
    ]);
  });

  it('counts the alerts the phone did not read, from the check', async () => {
    const { supabase } = fullServer({ rpc: { iot_check_alerts: OK({ urgent: 4, open: 27 }) } });
    const result = await loadSensorAlerts(supabase);
    expect(result.kind === 'loaded' && result.total).toBe(27);
  });

  it('goes by the list when the count is missing or smaller', async () => {
    for (const answer of [OK(null), OK({ open: 1 }), OK({ open: 'lots' })]) {
      const { supabase } = fullServer({ rpc: { iot_check_alerts: answer } });
      const result = await loadSensorAlerts(supabase);
      expect(result.kind === 'loaded' && result.total).toBe(3);
    }
  });

  it('reads nothing else when no alerts need anyone', async () => {
    const { supabase, reads } = fullServer({
      rpc: { iot_check_alerts: OK({ urgent: 0, open: 0 }) },
      tables: { iot_alerts: OK([]) },
    });
    expect(await loadSensorAlerts(supabase)).toEqual({ kind: 'loaded', alerts: [], total: 0 });
    expect(reads.map((read) => read.table)).toEqual(['iot_alerts']);
  });

  it('does not ask the server when the phone knows it has no signal', async () => {
    online(false);
    const { supabase, rpcCalls } = fullServer();
    expect(await loadSensorAlerts(supabase)).toEqual({ kind: 'offline' });
    expect(rpcCalls).toEqual([]);
  });

  it('tries when the phone is not sure about signal', async () => {
    online(null);
    const { supabase } = fullServer();
    expect((await loadSensorAlerts(supabase)).kind).toBe('loaded');
  });

  it.each([
    ['no answer', NO_ANSWER],
    ['a request that ran out of time', new Error('The request took too long.')],
  ])('counts %s as no signal', async (_why, answer) => {
    const { supabase } = fullServer({ rpc: { iot_check_alerts: answer } });
    expect(await loadSensorAlerts(supabase)).toEqual({ kind: 'offline' });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('says so when the account is not allowed to read alerts', async () => {
    const { supabase } = fullServer({ rpc: { iot_check_alerts: ERROR('42501', 403) } });
    expect(await loadSensorAlerts(supabase)).toEqual({ kind: 'not-allowed' });
    expect(console.warn).not.toHaveBeenCalled();

    const read = fullServer({ tables: { iot_alerts: ERROR('42501', 403) } });
    expect(await loadSensorAlerts(read.supabase)).toEqual({ kind: 'not-allowed' });
  });

  it('warns and fails on any other error, like a server without 017', async () => {
    const { supabase } = fullServer({ rpc: { iot_check_alerts: ERROR('PGRST202', 404) } });
    expect(await loadSensorAlerts(supabase)).toEqual({ kind: 'failed' });
    expect(console.warn).toHaveBeenCalledWith(
      "Couldn't check the sensor alerts.",
      expect.anything(),
    );

    const read = fullServer({ tables: { iot_alerts: ERROR('42P01', 404) } });
    expect(await loadSensorAlerts(read.supabase)).toEqual({ kind: 'failed' });
  });
});

describe('acknowledgeSensorAlert', () => {
  it('tells the server someone is on the alert', async () => {
    const { supabase, rpcCalls } = fakeServer({ rpc: { iot_acknowledge_alert: OK(null) } });
    expect(await acknowledgeSensorAlert(supabase, 41)).toBe('done');
    expect(rpcCalls).toEqual([['iot_acknowledge_alert', { alert: 41 }]]);
  });

  it('does not ask the server when the phone knows it has no signal', async () => {
    online(false);
    const { supabase, rpcCalls } = fakeServer({});
    expect(await acknowledgeSensorAlert(supabase, 41)).toBe('offline');
    expect(rpcCalls).toEqual([]);
  });

  it.each([
    ['no answer', NO_ANSWER, 'offline'],
    ['a request that ran out of time', new Error('The request took too long.'), 'offline'],
    ['an account that cannot', ERROR('42501', 403), 'not-allowed'],
    ['any other error', ERROR('P0002', 404), 'failed'],
  ])('handles %s', async (_why, answer, outcome) => {
    const { supabase } = fakeServer({ rpc: { iot_acknowledge_alert: answer } });
    expect(await acknowledgeSensorAlert(supabase, 41)).toBe(outcome);
    expect(jest.mocked(console.warn).mock.calls.length).toBe(outcome === 'failed' ? 1 : 0);
  });
});

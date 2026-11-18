// Reads the sensor alerts that need someone, for an officer's phone. It asks the server the same
// things the website's Sensors page does: iot_check_alerts first, so a node that has gone quiet
// gets its alert (nothing else sets that one off), then the alerts still going on that nobody is
// on yet (supabase/017_iot_alerts.sql). For each node it also finds the tagged plants close by, so
// whoever goes out knows what to check. Only officers and admins can read any of it.
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Network from 'expo-network';

import {
  NEARBY_PLANT_COLUMNS,
  NEARBY_RADIUS_M,
  NEARBY_READ_LIMIT,
  alertFromRow,
  alertOrder,
  boxAround,
  nearestPlants,
  nodeSpots,
  type NearbyPlants,
  type SensorAlert,
} from '@/lib/sensor-alerts';

/** The most alerts the phone reads at once. The website's Sensors page has all of them. */
export const ALERTS_READ_LIMIT = 20;

/** An alert that needs someone, with the tagged plants near its node. */
export type AlertWithPlants = SensorAlert & { nearby: NearbyPlants };

export type LoadAlertsResult =
  /** total is how many alerts need someone, which can be more than the phone read. */
  | { kind: 'loaded'; alerts: AlertWithPlants[]; total: number }
  /** No answer from the server, which is just no signal. */
  | { kind: 'offline' }
  /** The server says this account can't read alerts, like a botanist's. */
  | { kind: 'not-allowed' }
  /** Any other answer, like when the server doesn't have 017 yet. */
  | { kind: 'failed' };

type Answer = {
  error: { code?: string; message?: string } | null;
  status: number;
};

type Problem = 'offline' | 'not-allowed' | 'failed';

/** What an answer with an error means, or null if there's no error. */
function problemWith(answer: Answer, message: string): Problem | null {
  const { error, status } = answer;
  if (!error) {
    return null;
  }
  if (status === 0) {
    return 'offline';
  }
  if (error.code === '42501') {
    return 'not-allowed';
  }
  // An answer with an error won't fix itself, like when 017 hasn't been run on the server.
  console.warn(message, error);
  return 'failed';
}

async function isOffline() {
  // Only a phone that knows it has no signal counts as offline. If it isn't sure, it tries.
  const network = await Network.getNetworkStateAsync();
  return network.isConnected === false;
}

/**
 * Where each node is. A read that fails just means no spot from it, because the alert is still
 * worth showing without the plants near it. The spot on the node needs 026 on the server.
 */
async function readNodeSpots(supabase: SupabaseClient, nodeIds: string[]) {
  const [boots, nodes] = await Promise.all([
    supabase
      .from('iot_boots')
      .select('node_id, latitude, longitude, position_at')
      .in('node_id', nodeIds)
      .not('latitude', 'is', null)
      .order('position_at', { ascending: false, nullsFirst: false })
      .limit(NEARBY_READ_LIMIT),
    supabase.from('iot_nodes').select('node_id, latitude, longitude').in('node_id', nodeIds),
  ]);
  return nodeSpots(boots.error ? [] : (boots.data ?? []), nodes.error ? [] : (nodes.data ?? []));
}

/** The tagged plants near one node, read from the staff view of the records. */
async function readNearby(
  supabase: SupabaseClient,
  spot: { latitude: number; longitude: number },
): Promise<NearbyPlants> {
  const box = boxAround(spot, NEARBY_RADIUS_M);
  const { data, error } = await supabase
    .from('records_staff')
    .select(NEARBY_PLANT_COLUMNS)
    .neq('status', 'rejected')
    .gte('gps->lat', box.south)
    .lte('gps->lat', box.north)
    .gte('gps->lng', box.west)
    .lte('gps->lng', box.east)
    .limit(NEARBY_READ_LIMIT);
  if (error) {
    return { kind: 'failed' };
  }
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return {
    kind: 'found',
    plants: nearestPlants(spot, rows),
    // A read that hit the limit may have missed a nearer plant.
    maybeMore: rows.length >= NEARBY_READ_LIMIT,
  };
}

/** Everything an officer's phone shows about the alerts that need someone. Never throws. */
export async function loadSensorAlerts(supabase: SupabaseClient): Promise<LoadAlertsResult> {
  if (await isOffline()) {
    return { kind: 'offline' };
  }
  try {
    const checked = await supabase.rpc('iot_check_alerts');
    const checkProblem = problemWith(checked, "Couldn't check the sensor alerts.");
    if (checkProblem) {
      return { kind: checkProblem };
    }
    const counted = Number((checked.data as { open?: unknown } | null)?.open);
    // The same rule as iot_check_alerts: still going on, nobody is on it yet, and not from an
    // edge device's backlog. Only the columns 017 has, so the phone works without 026.
    const read = await supabase
      .from('iot_alerts')
      .select('id, node_id, node_name, type, severity, recorded_at')
      .eq('status', 'open')
      .is('cleared_at', null)
      .eq('from_backlog', false)
      .order('recorded_at', { ascending: false })
      .limit(ALERTS_READ_LIMIT);
    const readProblem = problemWith(read, "Couldn't read the sensor alerts.");
    if (readProblem) {
      return { kind: readProblem };
    }
    const rows: unknown[] = Array.isArray(read.data) ? read.data : [];
    const alerts = rows
      .map(alertFromRow)
      .filter((alert): alert is SensorAlert => alert !== undefined)
      .sort(alertOrder);
    // The count and the list come from two requests, so the bigger one wins if they differ.
    const total = Math.max(alerts.length, Number.isSafeInteger(counted) ? counted : 0);
    if (alerts.length === 0) {
      return { kind: 'loaded', alerts: [], total };
    }

    const nodeIds = [...new Set(alerts.map((alert) => alert.nodeId))];
    const spots = await readNodeSpots(supabase, nodeIds);
    const nearby = new Map<string, NearbyPlants>();
    await Promise.all(
      nodeIds.map(async (nodeId) => {
        const spot = spots.get(nodeId);
        nearby.set(nodeId, spot ? await readNearby(supabase, spot) : { kind: 'no-position' });
      }),
    );
    return {
      kind: 'loaded',
      alerts: alerts.map((alert) => ({
        ...alert,
        nearby: nearby.get(alert.nodeId) ?? { kind: 'no-position' },
      })),
      total,
    };
  } catch {
    // The time limit on every request ends one that hangs by throwing.
    return { kind: 'offline' };
  }
}

export type AcknowledgeOutcome = 'done' | 'offline' | 'not-allowed' | 'failed';

/**
 * Tells the server someone is on this alert, the same as Acknowledge on the website. The alert
 * stays open until it's resolved there, but it stops counting as one that needs someone.
 */
export async function acknowledgeSensorAlert(
  supabase: SupabaseClient,
  id: number,
): Promise<AcknowledgeOutcome> {
  if (await isOffline()) {
    return 'offline';
  }
  let answer;
  try {
    answer = await supabase.rpc('iot_acknowledge_alert', { alert: id });
  } catch {
    return 'offline';
  }
  const problem = problemWith(answer, "Couldn't mark the sensor alert as being dealt with.");
  return problem ?? 'done';
}

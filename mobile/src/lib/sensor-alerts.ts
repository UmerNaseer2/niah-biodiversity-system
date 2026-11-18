// Sensor alerts on a field officer's phone. The website's Sensors page is where alerts are dealt
// with in full, and this is the part a person in the forest needs: what went off, where, what to
// do about it, and which tagged plants are near the node so they know what to check. The words
// and the nearby plant rules are the same as the website's (web/src/lib/iot.ts and
// web/src/lib/nearby-plants.ts). Nothing here reads the clock or the server, so it can be tested.
import { tagCodeFor } from '@/lib/id';

export type AlertType =
  'SATURATED' | 'DRY' | 'HEAVY' | 'RAIN' | 'MOVED' | 'NO_ECHO' | 'MOTION' | 'TOO_HOT' | 'QUIET';

export type AlertSeverity = 'urgent' | 'routine';

/** One alert that needs someone: still going on, nobody is on it yet, and not from a backlog. */
export type SensorAlert = {
  id: number;
  nodeId: string;
  nodeName: string;
  type: AlertType;
  severity: AlertSeverity;
  /** When it started. For QUIET, the last reading before the node went quiet. */
  recordedAt: string;
};

/** Who can read alerts on the server (supabase/017_iot_alerts.sql). */
export const ALERT_ROLES = ['conservation_officer', 'admin'];

export function canSeeAlerts(role: string | null) {
  return role !== null && ALERT_ROLES.includes(role);
}

// The same words as the website, apart from where the website says to press a button on its page.
export const ALERT_WORDS: Record<AlertType, { title: string; means: string; todo: string }> = {
  SATURATED: {
    title: 'Soil is saturated',
    means:
      "The soil here is soaked through. That's a flash flood risk for the plants on this slope.",
    todo:
      "Look at the rain on this node and the ones near it. If it's still raining hard, keep " +
      'patrols away from the stream banks and check the plants once the water is down.',
  },
  DRY: {
    title: 'Soil is very dry',
    means:
      'The soil here is drier than its limit. The plant may be short of water and the slope may ' +
      'erode, or the probe may have come loose.',
    todo:
      'Check the probe at the next visit. If the soil really is that dry, tell the botanist who ' +
      'looks after this plot.',
  },
  HEAVY: {
    title: 'Heavy rain',
    means: 'The rain pad on this node is wet past its heavy rain limit.',
    todo:
      'Watch the soil on this node and the others nearby for flooding. Hold off on patrols near ' +
      'streams until it eases.',
  },
  RAIN: {
    title: 'Raining',
    means: 'The rain pad on this node is wet.',
    todo: "Nothing straight away. It's here so you can see when rain started.",
  },
  MOVED: {
    title: 'Node moved or knocked',
    means:
      "The node's distance to the ground has changed. It may have been knocked, moved, or " +
      'fallen, or something is in front of the sensor.',
    todo:
      'Check the plant and the node as soon as you can. If it was put back on purpose, reset its ' +
      "baseline on the website's Sensors page.",
  },
  NO_ECHO: {
    title: 'Distance sensor blocked',
    means:
      "The node's distance sensor gets no echo. It may be covered, tilted towards the sky, wet, " +
      'or the node has fallen.',
    todo: "Look at the node. If it's only rain on the sensor, this ends by itself once it dries.",
  },
  MOTION: {
    title: 'Movement near a plant',
    means: 'The motion sensor saw something near this plant. It could be a person or an animal.',
    todo:
      'Check if anyone is meant to be there today. If it keeps coming back, go and take a ' +
      'look.',
  },
  TOO_HOT: {
    title: 'Too hot, possible fire',
    means:
      "The air temperature here is past its limit. Under the canopy that's unusual, and it " +
      'could be a fire nearby, or the sensor sitting in direct sun.',
    todo:
      "Compare it with the nodes nearby on the website. If they're hot too, or the node then " +
      'goes quiet, look for smoke or fire straight away.',
  },
  QUIET: {
    title: 'Node has gone quiet',
    means:
      'Nothing has come in from this node. Its power or WiFi may be down, or it may have been ' +
      'damaged or taken.',
    todo:
      'See on the website if the other nodes on the same edge device are quiet too. If only ' +
      'this one is, go and look at it. This ends by itself when readings come back.',
  },
};

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** One row of iot_alerts as a SensorAlert, or undefined if it's missing something or is new. */
export function alertFromRow(row: unknown): SensorAlert | undefined {
  if (typeof row !== 'object' || row === null) {
    return undefined;
  }
  const value = row as Record<string, unknown>;
  const id = Number(value.id);
  const type = value.type;
  if (
    !Number.isSafeInteger(id) ||
    !isText(value.node_id) ||
    !isText(value.recorded_at) ||
    typeof type !== 'string' ||
    !(type in ALERT_WORDS) ||
    (value.severity !== 'urgent' && value.severity !== 'routine')
  ) {
    return undefined;
  }
  return {
    id,
    nodeId: value.node_id,
    // The node's name as it was when the alert opened. A node with no name shows its ID.
    nodeName: isText(value.node_name) ? value.node_name : value.node_id,
    type: type as AlertType,
    severity: value.severity,
    recordedAt: value.recorded_at,
  };
}

/** Urgent ones first, then the newest. */
export function alertOrder(a: SensorAlert, b: SensorAlert) {
  return (
    Number(b.severity === 'urgent') - Number(a.severity === 'urgent') ||
    Date.parse(b.recordedAt) - Date.parse(a.recordedAt) ||
    b.id - a.id
  );
}

/** The urgent alerts in `alerts` that weren't in the list the phone had before. */
export function newUrgentAlerts(alerts: SensorAlert[], seen: ReadonlySet<number>) {
  return alerts.filter((alert) => alert.severity === 'urgent' && !seen.has(alert.id));
}

/** What a screen reader says when urgent alerts come in, so it's heard without looking. */
export function urgentAnnouncement(alerts: SensorAlert[]) {
  if (alerts.length === 1) {
    const [alert] = alerts;
    return `Urgent sensor alert. ${ALERT_WORDS[alert.type].title} at ${alert.nodeName}.`;
  }
  return `${alerts.length} urgent sensor alerts. They're at the top of the Home tab.`;
}

// The tagged plants near a node. The website lists them on each alert too.

/** How far from a node a plant can be and still count as near it. */
export const NEARBY_RADIUS_M = 100;

/** How many plants an alert lists. */
export const NEARBY_SHOWN = 3;

/** The most records read for one node. If a read hits it, the list may not be the nearest. */
export const NEARBY_READ_LIMIT = 500;

/** What the phone reads from records_staff for this. Only staff can read the exact spots. */
export const NEARBY_PLANT_COLUMNS = 'id, tag_code, species_name, common_name, status, gps';

const EARTH_RADIUS_M = 6_371_000;
const METRES_PER_DEGREE = 111_320;

export type Point = { latitude: number; longitude: number };

export type NearbyPlant = {
  id: string;
  tagCode: string;
  speciesName: string;
  commonName?: string;
  /** Whole metres from the node. */
  distanceM: number;
  /** Still waiting for an officer to review it. */
  waiting: boolean;
};

/** What an alert shows about the plants near its node. */
export type NearbyPlants =
  | { kind: 'no-position' }
  | { kind: 'failed' }
  | { kind: 'found'; plants: NearbyPlant[]; maybeMore: boolean };

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A latitude and longitude that could be on Earth, or null. Postgres numerics come as text. */
export function pointFrom(latitude: unknown, longitude: unknown): Point | null {
  const lat = typeof latitude === 'string' && latitude.trim() ? Number(latitude) : latitude;
  const lng = typeof longitude === 'string' && longitude.trim() ? Number(longitude) : longitude;
  if (!isNumber(lat) || !isNumber(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { latitude: lat, longitude: lng };
}

/** Metres between two points along the ground (the haversine formula). */
export function metresBetween(a: Point, b: Point) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A box that holds every point within radiusM of the centre, a little bigger than the circle. */
export function boxAround(centre: Point, radiusM: number) {
  // Padded by 1% so rounding never cuts off a plant right on the edge.
  const latStep = (radiusM * 1.01) / METRES_PER_DEGREE;
  const lngStep =
    (radiusM * 1.01) /
    (METRES_PER_DEGREE * Math.max(0.01, Math.cos((centre.latitude * Math.PI) / 180)));
  return {
    south: centre.latitude - latStep,
    north: centre.latitude + latStep,
    west: centre.longitude - lngStep,
    east: centre.longitude + lngStep,
  };
}

/**
 * The plants within NEARBY_RADIUS_M of the node, nearest first, at most NEARBY_SHOWN of them. Rows
 * are from records_staff. A rejected record, or one with no usable spot, is left out.
 */
export function nearestPlants(node: Point, rows: readonly unknown[]): NearbyPlant[] {
  const plants: NearbyPlant[] = [];
  for (const item of rows) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (!isText(row.id) || row.status === 'rejected') {
      continue;
    }
    const gps = row.gps as { lat?: unknown; lng?: unknown } | null | undefined;
    const spot = gps && typeof gps === 'object' ? pointFrom(gps.lat, gps.lng) : null;
    if (!spot) {
      continue;
    }
    const distance = metresBetween(node, spot);
    if (distance > NEARBY_RADIUS_M) {
      continue;
    }
    plants.push({
      id: row.id,
      // The same code the website makes from the ID when a record has none.
      tagCode: isText(row.tag_code) ? row.tag_code : tagCodeFor(row.id),
      speciesName: isText(row.species_name) ? row.species_name : 'Not named yet',
      commonName: isText(row.common_name) ? row.common_name : undefined,
      distanceM: Math.round(distance),
      waiting: row.status === 'waiting',
    });
  }
  return plants
    .sort((a, b) => a.distanceM - b.distanceM || a.tagCode.localeCompare(b.tagCode))
    .slice(0, NEARBY_SHOWN);
}

/**
 * Where each node is: its newest position from a power-up (iot_boots, newest first), or else the
 * spot saved on the node (iot_nodes). The website's map goes by the same rule.
 */
export function nodeSpots(bootRows: readonly unknown[], nodeRows: readonly unknown[]) {
  const spots = new Map<string, Point>();
  for (const rows of [bootRows, nodeRows]) {
    for (const item of rows) {
      const row = (typeof item === 'object' && item !== null ? item : {}) as Record<
        string,
        unknown
      >;
      const spot = pointFrom(row.latitude, row.longitude);
      if (isText(row.node_id) && spot && !spots.has(row.node_id)) {
        spots.set(row.node_id, spot);
      }
    }
  }
  return spots;
}

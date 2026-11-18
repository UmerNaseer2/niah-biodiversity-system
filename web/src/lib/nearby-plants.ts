// Which tagged plants are near a sensor node, so an alert can say which plants to go and check.
// The page reads the records in a small box around each node (boxAround), then this works out the
// real distances and keeps the nearest few. Nothing here reads the database, so it can be tested.

import { tagCode } from "./tags.ts";

/** How far from a node a plant can be and still count as near it */
export const NEARBY_RADIUS_M = 100;

/** How many plants a node or an alert lists */
export const NEARBY_SHOWN = 3;

/**
 * The most records read for one node. A 200 m square with more plants than this would be very busy.
 * If a read hits it, the list may not be the nearest, and the page says so.
 */
export const NEARBY_READ_LIMIT = 500;

/** What the page reads from records_staff for this. Only staff can read the exact spots. */
export const NEARBY_PLANT_COLUMNS = "id, tag_code, species_name, common_name, status, gps";

export const NO_POSITION_TEXT = "No position for this node yet.";
export const NONE_NEAR_TEXT = `No tagged plants within ${NEARBY_RADIUS_M} m.`;
export const DIDNT_LOAD_TEXT = "The plants near this node didn’t load. Refresh the page to try again.";
export const MAYBE_MORE_TEXT =
  "There are a lot of records around this node, so these may not be the nearest ones.";

const EARTH_RADIUS_M = 6_371_000;
const METRES_PER_DEGREE = 111_320;

export type Point = { latitude: number; longitude: number };

export type NearbyPlant = {
  id: string;
  tagCode: string;
  speciesName: string;
  commonName: string | null;
  /** Whole metres from the node */
  distanceM: number;
  /** Still waiting for an officer to review it */
  waiting: boolean;
};

/** What a node card or an alert shows about the plants near the node */
export type NearbyPlants =
  | { kind: "no-position" }
  | { kind: "failed" }
  | { kind: "found"; plants: NearbyPlant[]; maybeMore: boolean };

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A latitude and longitude that could be on Earth, or null */
export function pointFrom(latitude: unknown, longitude: unknown): Point | null {
  if (!isNumber(latitude) || !isNumber(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** Metres between two points along the ground (the haversine formula) */
export function metresBetween(a: Point, b: Point) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A box of latitudes and longitudes that holds every point within radiusM of the centre. It's a
 * little bigger than the circle, so the page reads a few extra records and nearestPlants drops them.
 */
export function boxAround(centre: Point, radiusM: number) {
  // Padded by 1% so rounding never cuts off a plant right on the edge
  const latStep = (radiusM * 1.01) / METRES_PER_DEGREE;
  const lngStep = (radiusM * 1.01) / (METRES_PER_DEGREE * Math.max(0.01, Math.cos((centre.latitude * Math.PI) / 180)));
  return {
    south: centre.latitude - latStep,
    north: centre.latitude + latStep,
    west: centre.longitude - lngStep,
    east: centre.longitude + lngStep,
  };
}

/**
 * The plants within radiusM of the node, nearest first, at most `shown` of them. Rows are from
 * records_staff. A rejected record, or one with no usable spot, is left out.
 */
export function nearestPlants(
  node: Point,
  rows: readonly Record<string, unknown>[],
  { radiusM = NEARBY_RADIUS_M, shown = NEARBY_SHOWN }: { radiusM?: number; shown?: number } = {},
): NearbyPlant[] {
  const plants: NearbyPlant[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string" || !row.id || row.status === "rejected") continue;
    const gps = row.gps as { lat?: unknown; lng?: unknown } | null | undefined;
    const spot = gps ? pointFrom(gps.lat, gps.lng) : null;
    if (!spot) continue;
    const distance = metresBetween(node, spot);
    if (distance > radiusM) continue;
    plants.push({
      id: row.id,
      tagCode: typeof row.tag_code === "string" && row.tag_code ? row.tag_code : tagCode(row.id),
      speciesName: typeof row.species_name === "string" && row.species_name.trim() ? row.species_name : "Not named yet",
      commonName: typeof row.common_name === "string" && row.common_name.trim() ? row.common_name : null,
      distanceM: Math.round(distance),
      waiting: row.status === "waiting",
    });
  }
  return plants
    .sort((a, b) => a.distanceM - b.distanceM || a.tagCode.localeCompare(b.tagCode))
    .slice(0, shown);
}

/** The whole answer for one node, from its spot and what the box read gave back */
export function nearbyFromRead(
  node: Point | null,
  read: { rows: readonly Record<string, unknown>[] | null; failed: boolean },
): NearbyPlants {
  if (!node) return { kind: "no-position" };
  if (read.failed || !read.rows) return { kind: "failed" };
  return {
    kind: "found",
    plants: nearestPlants(node, read.rows),
    maybeMore: read.rows.length >= NEARBY_READ_LIMIT,
  };
}

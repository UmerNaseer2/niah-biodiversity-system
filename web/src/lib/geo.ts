// Public pages never get the exact point for a sensitive species. The point
// is snapped to a fixed grid of 0.004 degree squares (about 440 m at Niah),
// so the square the public sees is not centred on the plant.

export const GRID_DEG = 0.004;

/** Park HQ at Pangkalan Lubang, same as the mobile app */
export const PARK_HQ = { lat: 3.8141, lng: 113.7787 };

export type Area = { south: number; west: number; north: number; east: number };

export function roughArea(lat: number, lng: number): Area {
  const south = Math.floor(lat / GRID_DEG) * GRID_DEG;
  const west = Math.floor(lng / GRID_DEG) * GRID_DEG;
  return { south, west, north: south + GRID_DEG, east: west + GRID_DEG };
}

/** One square per grid cell, even if several plants share it */
export function roughAreas(points: { lat: number; lng: number }[]) {
  const cells = new Map<string, Area & { id: string }>();
  for (const p of points) {
    const area = roughArea(p.lat, p.lng);
    const id = `${area.south.toFixed(3)},${area.west.toFixed(3)}`;
    cells.set(id, { ...area, id });
  }
  return [...cells.values()];
}

const METRES_PER_DEGREE = 111_320;

/** "about 450 m south east of park HQ", only for plants whose spot is public */
export function fromHq(lat: number, lng: number) {
  const north = (lat - PARK_HQ.lat) * METRES_PER_DEGREE;
  const east =
    (lng - PARK_HQ.lng) *
    METRES_PER_DEGREE *
    Math.cos((PARK_HQ.lat * Math.PI) / 180);
  const metres = Math.hypot(north, east);
  // A direction only counts if it is more than about 22 degrees off the
  // other one, so we get "east" instead of "north east" for a point due east
  const share = metres * 0.38;
  const direction = [
    Math.abs(north) > share ? (north > 0 ? "north" : "south") : "",
    Math.abs(east) > share ? (east > 0 ? "east" : "west") : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `about ${Math.round(metres / 10) * 10} m ${direction} of park HQ`;
}

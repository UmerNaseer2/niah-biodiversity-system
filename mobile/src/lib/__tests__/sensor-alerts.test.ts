import { tagCodeFor } from '@/lib/id';
import {
  ALERT_WORDS,
  NEARBY_RADIUS_M,
  alertFromRow,
  alertOrder,
  boxAround,
  canSeeAlerts,
  metresBetween,
  nearestPlants,
  newUrgentAlerts,
  nodeSpots,
  pointFrom,
  urgentAnnouncement,
  type SensorAlert,
} from '@/lib/sensor-alerts';

// Near the park's headquarters, where the stand-in server keeps its sample plants.
const NODE = { latitude: 3.8157, longitude: 113.7786 };
const METRES_PER_DEGREE = 111_195;

/** A spot this many metres north of the node. */
function north(metres: number) {
  return { lat: NODE.latitude + metres / METRES_PER_DEGREE, lng: NODE.longitude };
}

// One row of iot_alerts the way the server sends it. The ID is a bigint, so it can come as text.
const ROW = {
  id: '41',
  node_id: 'node-01',
  node_name: 'Pitcher slope',
  type: 'SATURATED',
  severity: 'urgent',
  recorded_at: '2026-11-18T02:00:00+00:00',
};

function alert(id: number, severity: 'urgent' | 'routine', recordedAt: string): SensorAlert {
  return { id, nodeId: 'node-01', nodeName: 'Pitcher slope', type: 'RAIN', severity, recordedAt };
}

describe('canSeeAlerts', () => {
  it('lets officers and admins read alerts, the same as the server', () => {
    expect(canSeeAlerts('conservation_officer')).toBe(true);
    expect(canSeeAlerts('admin')).toBe(true);
  });

  it.each(['botanist', 'researcher', 'visitor', 'staff', ''])('leaves out %p', (role) => {
    expect(canSeeAlerts(role)).toBe(false);
  });

  it("leaves out an account whose role the phone hasn't read yet", () => {
    expect(canSeeAlerts(null)).toBe(false);
  });
});

describe('alertFromRow', () => {
  it('turns a row from the server into an alert', () => {
    expect(alertFromRow(ROW)).toEqual({
      id: 41,
      nodeId: 'node-01',
      nodeName: 'Pitcher slope',
      type: 'SATURATED',
      severity: 'urgent',
      recordedAt: ROW.recorded_at,
    });
  });

  it('shows the node ID when the node has no name', () => {
    expect(alertFromRow({ ...ROW, node_name: null })?.nodeName).toBe('node-01');
    expect(alertFromRow({ ...ROW, node_name: '  ' })?.nodeName).toBe('node-01');
  });

  it.each([
    ['a type the phone has no words for', { type: 'FLOOD' }],
    ['a severity it does not know', { severity: 'high' }],
    ['no node', { node_id: null }],
    ['no time', { recorded_at: '' }],
    ['an ID that is not a whole number', { id: 'abc' }],
    ['an ID with a fraction', { id: 4.5 }],
  ])('leaves out a row with %s', (_why, change) => {
    expect(alertFromRow({ ...ROW, ...change })).toBeUndefined();
  });

  it('leaves out something that is not a row', () => {
    expect(alertFromRow(null)).toBeUndefined();
    expect(alertFromRow('SATURATED')).toBeUndefined();
  });
});

describe('ALERT_WORDS', () => {
  it.each(Object.entries(ALERT_WORDS))('says what %s means and what to do', (_type, words) => {
    expect(words.title.trim()).not.toBe('');
    expect(words.means.trim()).not.toBe('');
    expect(words.todo.trim()).not.toBe('');
    // The phone has no buttons for alerts other than I'm on it, so it never says to press one.
    expect(words.todo).not.toMatch(/\b(press|click|tap)\b/i);
  });
});

describe('alertOrder', () => {
  it('puts urgent alerts first, then the newest', () => {
    const oldUrgent = alert(1, 'urgent', '2026-11-17T01:00:00Z');
    const newUrgent = alert(2, 'urgent', '2026-11-18T01:00:00Z');
    const newRoutine = alert(3, 'routine', '2026-11-18T03:00:00Z');
    const sameTime = alert(4, 'urgent', '2026-11-18T01:00:00Z');
    expect([oldUrgent, newRoutine, newUrgent, sameTime].sort(alertOrder)).toEqual([
      sameTime,
      newUrgent,
      oldUrgent,
      newRoutine,
    ]);
  });
});

describe('newUrgentAlerts', () => {
  it('only picks urgent alerts the phone has not had before', () => {
    const seenUrgent = alert(1, 'urgent', '2026-11-18T01:00:00Z');
    const newUrgent = alert(2, 'urgent', '2026-11-18T02:00:00Z');
    const newRoutine = alert(3, 'routine', '2026-11-18T03:00:00Z');
    expect(newUrgentAlerts([seenUrgent, newUrgent, newRoutine], new Set([1]))).toEqual([newUrgent]);
  });
});

describe('urgentAnnouncement', () => {
  it('names the alert and the node when there is one', () => {
    const one = { ...alert(1, 'urgent', '2026-11-18T01:00:00Z'), type: 'TOO_HOT' as const };
    expect(urgentAnnouncement([one])).toBe(
      'Urgent sensor alert. Too hot, possible fire at Pitcher slope.',
    );
  });

  it('counts them when there are more', () => {
    const two = [
      alert(1, 'urgent', '2026-11-18T01:00:00Z'),
      alert(2, 'urgent', '2026-11-18T02:00:00Z'),
    ];
    expect(urgentAnnouncement(two)).toBe(
      "2 urgent sensor alerts. They're at the top of the Home tab.",
    );
  });
});

describe('pointFrom', () => {
  it('takes numbers, and numbers written as text like Postgres sends them', () => {
    expect(pointFrom(3.8157, 113.7786)).toEqual(NODE);
    expect(pointFrom('3.8157', '113.7786')).toEqual(NODE);
  });

  it.each([
    [null, 113.7786],
    ['', 113.7786],
    ['north', 113.7786],
    [91, 113.7786],
    [3.8157, 181],
    [Number.NaN, 113.7786],
  ])('says no to %p, %p', (latitude, longitude) => {
    expect(pointFrom(latitude, longitude)).toBeNull();
  });
});

describe('metresBetween and boxAround', () => {
  it('measures along the ground', () => {
    expect(metresBetween(NODE, NODE)).toBe(0);
    const spot = north(100);
    expect(metresBetween(NODE, { latitude: spot.lat, longitude: spot.lng })).toBeCloseTo(100, 0);
  });

  it('makes a box that holds every point on the edge of the circle', () => {
    const box = boxAround(NODE, NEARBY_RADIUS_M);
    const edge = north(NEARBY_RADIUS_M);
    expect(edge.lat).toBeLessThan(box.north);
    expect(NODE.latitude - (edge.lat - NODE.latitude)).toBeGreaterThan(box.south);
    // A degree of longitude is a little shorter this far from the equator, so the box is wider.
    expect(box.east - NODE.longitude).toBeGreaterThan(box.north - NODE.latitude);
    expect(NODE.longitude - box.west).toBeCloseTo(box.east - NODE.longitude, 10);
  });
});

describe('nearestPlants', () => {
  const plant = (id: string, metres: number, extra: Record<string, unknown> = {}) => ({
    id,
    tag_code: `NNP-${id.slice(0, 6).toUpperCase()}`,
    species_name: 'Nepenthes rafflesiana',
    common_name: 'Raffles pitcher plant',
    status: 'approved',
    gps: north(metres),
    ...extra,
  });

  it('lists the nearest three within 100 m, nearest first', () => {
    const rows = [
      plant('aaaaaa01', 80),
      plant('bbbbbb02', 10),
      plant('cccccc03', 150),
      plant('dddddd04', 45, { status: 'waiting', common_name: null }),
      plant('eeeeee05', 95),
    ];
    expect(nearestPlants(NODE, rows)).toEqual([
      {
        id: 'bbbbbb02',
        tagCode: 'NNP-BBBBBB',
        speciesName: 'Nepenthes rafflesiana',
        commonName: 'Raffles pitcher plant',
        distanceM: 10,
        waiting: false,
      },
      {
        id: 'dddddd04',
        tagCode: 'NNP-DDDDDD',
        speciesName: 'Nepenthes rafflesiana',
        commonName: undefined,
        distanceM: 45,
        waiting: true,
      },
      expect.objectContaining({ id: 'aaaaaa01', distanceM: 80 }),
    ]);
  });

  it('leaves out rejected records and ones with no usable spot', () => {
    const rows = [
      plant('aaaaaa01', 10, { status: 'rejected' }),
      plant('bbbbbb02', 20, { gps: null }),
      plant('cccccc03', 30, { gps: { lat: 'north', lng: 113.7786 } }),
      plant('dddddd04', 40, { id: '' }),
      null,
      'a row',
    ];
    expect(nearestPlants(NODE, rows)).toEqual([]);
  });

  it('makes the tag code from the ID and fills in a missing name like the website', () => {
    const id = 'f00d0300-0000-4000-8000-000000000003';
    const [found] = nearestPlants(NODE, [
      plant(id, 20, { tag_code: null, species_name: '', common_name: '' }),
    ]);
    expect(found).toMatchObject({
      tagCode: tagCodeFor(id),
      speciesName: 'Not named yet',
      commonName: undefined,
    });
  });

  it('takes the spot as text too', () => {
    const spot = north(20);
    const rows = [plant('aaaaaa01', 0, { gps: { lat: String(spot.lat), lng: String(spot.lng) } })];
    expect(nearestPlants(NODE, rows)[0].distanceM).toBe(20);
  });
});

describe('nodeSpots', () => {
  it('takes the newest power-up position first, then the spot saved on the node', () => {
    const spots = nodeSpots(
      [
        { node_id: 'node-01', latitude: '3.8157', longitude: '113.7786' },
        // Older, so it doesn't count.
        { node_id: 'node-01', latitude: 3.9, longitude: 113.9 },
        { node_id: 'node-02', latitude: null, longitude: null },
      ],
      [
        { node_id: 'node-01', latitude: 1, longitude: 1 },
        { node_id: 'node-02', latitude: 3.81, longitude: 113.77 },
        { node_id: 'node-03', latitude: null, longitude: 113.77 },
        null,
      ],
    );
    expect(Object.fromEntries(spots)).toEqual({
      'node-01': NODE,
      'node-02': { latitude: 3.81, longitude: 113.77 },
    });
  });
});

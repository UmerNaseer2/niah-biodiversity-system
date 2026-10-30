import {
  gpsReducer,
  INITIAL_GPS_STATE,
  isCapturing,
  isFreshReading,
  MAX_CLOCK_GAP_MS,
  MAX_READING_AGE_MS,
  pickBetter,
  toGpsReading,
  type GpsEvent,
  type GpsState,
  type PhoneLocation,
} from '@/lib/gps';
import type { GpsReading } from '@/types/plant-record';

// Made-up points near the park HQ, not real plant locations.
const START = Date.parse('2026-10-16T01:00:00.000Z');

function fix(accuracy: number | null, timestamp = START + 1000, latitude = 3.81452): PhoneLocation {
  return { coords: { latitude, longitude: 113.77921, accuracy }, timestamp };
}

function reading(accuracyM: number, capturedAt = '2026-10-16T01:00:01.000Z'): GpsReading {
  return { latitude: 3.81452, longitude: 113.77921, accuracyM, capturedAt };
}

/** Runs the events in order from a fresh state. */
function run(...events: GpsEvent[]) {
  return events.reduce(gpsReducer, INITIAL_GPS_STATE);
}

const start: GpsEvent = { type: 'start', at: START };
const searching: GpsEvent = { type: 'searching' };
const location = (value: PhoneLocation): GpsEvent => ({ type: 'location', location: value });

describe('toGpsReading', () => {
  it('rounds the accuracy up and turns the time into ISO 8601', () => {
    expect(toGpsReading(fix(10.2))).toEqual({
      latitude: 3.81452,
      longitude: 113.77921,
      accuracyM: 11,
      capturedAt: '2026-10-16T01:00:01.000Z',
    });
  });

  it('keeps an accuracy of 0, which mock locations use', () => {
    expect(toGpsReading(fix(0))?.accuracyM).toBe(0);
  });

  it.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'turns down a reading with an accuracy of %p',
    (accuracy) => {
      expect(toGpsReading(fix(accuracy))).toBeUndefined();
    },
  );

  it('turns down a reading with broken coordinates or time', () => {
    expect(toGpsReading(fix(5, START, Number.NaN))).toBeUndefined();
    expect(toGpsReading(fix(5, Number.NaN))).toBeUndefined();
  });

  it('turns down a point that is not on the globe, and keeps one right at the edge', () => {
    expect(toGpsReading(fix(5, START, 90.5))).toBeUndefined();
    expect(toGpsReading(fix(5, START, -91))).toBeUndefined();
    const offEdge = fix(5);
    expect(
      toGpsReading({ ...offEdge, coords: { ...offEdge.coords, longitude: 180.1 } }),
    ).toBeUndefined();
    expect(toGpsReading(fix(5, START, -90))?.latitude).toBe(-90);
  });
});

describe('isFreshReading', () => {
  it('skips a fix saved from well before the capture started', () => {
    expect(isFreshReading(START - MAX_READING_AGE_MS, START)).toBe(true);
    expect(isFreshReading(START - MAX_READING_AGE_MS - 1, START)).toBe(false);
  });

  it('trusts a fix newer than the first one, in case the GPS clock is behind the phone', () => {
    const first = START - MAX_CLOCK_GAP_MS;
    expect(isFreshReading(first + 1000, START, first)).toBe(true);
    expect(isFreshReading(first, START, first)).toBe(false);
  });

  it('does not trust a fix newer than the first one when the first one is old', () => {
    // Both are fixes the phone saved earlier, an hour ago and half an hour ago.
    const first = START - 60 * 60_000;
    expect(isFreshReading(START - 30 * 60_000, START, first)).toBe(false);
    expect(isFreshReading(first + 1000, START, START - MAX_CLOCK_GAP_MS - 1)).toBe(false);
    // A fix from after the capture started still counts, whatever came first.
    expect(isFreshReading(START + 1000, START, first)).toBe(true);
  });
});

describe('pickBetter', () => {
  it('keeps the more accurate reading, and the newer one on a tie', () => {
    const old = reading(8, '2026-10-16T01:00:01.000Z');
    const tie = reading(8, '2026-10-16T01:00:02.000Z');
    expect(pickBetter(undefined, old)).toBe(old);
    expect(pickBetter(old, reading(12))).toBe(old);
    expect(pickBetter(old, tie)).toBe(tie);
  });
});

describe('gpsReducer', () => {
  it('finishes straight away with a fix of 10 m or better', () => {
    const state = run(start, searching, location(fix(9.4)));
    expect(state).toEqual({ status: 'done', saved: reading(10), canAskAgain: true });
    expect(isCapturing(state.status)).toBe(false);
  });

  it('keeps going with a rough fix and holds on to the best one', () => {
    let state = run(start, searching, location(fix(30)));
    expect(state.status).toBe('improving');
    expect(state.best?.accuracyM).toBe(30);
    expect(state.saved).toBeUndefined();

    state = gpsReducer(state, location(fix(18, START + 2000)));
    state = gpsReducer(state, location(fix(40, START + 3000)));
    expect(state.status).toBe('improving');
    expect(state.best).toEqual(reading(18, '2026-10-16T01:00:02.000Z'));
  });

  it('saves the best fix when the time is up or the user takes it early', () => {
    const improving = run(start, searching, location(fix(18)));
    expect(gpsReducer(improving, { type: 'settle' })).toEqual({
      status: 'done',
      saved: reading(18),
      canAskAgain: true,
    });
    expect(gpsReducer(improving, { type: 'accept' }).saved).toEqual(reading(18));
  });

  it('skips a saved fix from before the capture started', () => {
    const state = run(start, searching, location(fix(5, START - 5 * 60_000)));
    expect(state.status).toBe('searching');
    expect(state.best).toBeUndefined();

    const next = gpsReducer(state, location(fix(6, START + 1000)));
    expect(next.saved?.accuracyM).toBe(6);
  });

  it('skips two saved fixes in a row, even though the second is newer', () => {
    let state = run(start, searching, location(fix(30, START - 60 * 60_000)));
    state = gpsReducer(state, location(fix(5, START - 30 * 60_000)));
    expect(state.status).toBe('searching');
    expect(state.best).toBeUndefined();
    expect(state.saved).toBeUndefined();
  });

  it('trusts a GPS clock that is a little behind once the first fix has come in', () => {
    // Every fix is stamped 20 seconds behind the phone's clock.
    let state = run(start, searching, location(fix(30, START - 20_000)));
    expect(state.status).toBe('searching');

    state = gpsReducer(state, location(fix(18, START - 19_000)));
    expect(state.status).toBe('improving');
    expect(state.best?.accuracyM).toBe(18);
  });

  it('skips a reading with no accuracy', () => {
    expect(run(start, searching, location(fix(null))).status).toBe('searching');
  });

  it('gives up after no fix, but keeps a location from before', () => {
    expect(run(start, searching, { type: 'no-fix' })).toEqual({
      status: 'no-fix',
      saved: undefined,
      canAskAgain: true,
    });

    const retake = run(start, searching, location(fix(4)), start, searching, { type: 'no-fix' });
    expect(retake.status).toBe('no-fix');
    expect(retake.saved).toEqual(reading(4));
  });

  it('only gives up on a first fix, not while improving', () => {
    const improving = run(start, searching, location(fix(30)));
    expect(gpsReducer(improving, { type: 'no-fix' })).toBe(improving);
  });

  it('goes back to the old location, or to nothing, on cancel', () => {
    expect(run(start, searching, location(fix(30)), { type: 'cancel' })).toEqual({
      status: 'idle',
      saved: undefined,
      canAskAgain: true,
    });

    const retake = run(start, searching, location(fix(4)), start, { type: 'cancel' });
    expect(retake.status).toBe('done');
    expect(retake.saved).toEqual(reading(4));
  });

  it('remembers whether the permission prompt can show again', () => {
    expect(run(start, { type: 'denied', canAskAgain: false })).toEqual({
      status: 'denied',
      saved: undefined,
      canAskAgain: false,
    });
    // A new capture starts hopeful again, in case the user changed it in Settings.
    expect(run(start, { type: 'denied', canAskAgain: false }, start).canAskAgain).toBe(true);
  });

  it.each(['approximate', 'services-off'] as const)('stops when the phone reports %s', (type) => {
    expect(run(start, { type }).status).toBe(type);
  });

  it('stops on an error while capturing', () => {
    expect(run(start, searching, { type: 'error' }).status).toBe('error');
    expect(run(start, searching, location(fix(30)), { type: 'error' }).status).toBe('error');
  });

  it('ignores anything that arrives after the capture is over', () => {
    const done = run(start, searching, location(fix(4)));
    const late: GpsEvent[] = [
      location(fix(2, START + 5000)),
      searching,
      { type: 'denied', canAskAgain: false },
      { type: 'approximate' },
      { type: 'no-fix' },
      { type: 'settle' },
      { type: 'accept' },
      { type: 'cancel' },
      { type: 'error' },
    ];
    late.forEach((event) => expect(gpsReducer(done, event)).toBe(done));
    expect(gpsReducer(INITIAL_GPS_STATE, location(fix(4)))).toBe(INITIAL_GPS_STATE);
  });

  it('keeps a capture that is already running when start comes again', () => {
    const searchingState = run(start, searching);
    expect(gpsReducer(searchingState, { type: 'start', at: START + 5000 })).toBe(searchingState);
  });

  it('forgets everything on clear', () => {
    const state: GpsState = run(start, searching, location(fix(4)));
    expect(gpsReducer(state, { type: 'clear' })).toBe(INITIAL_GPS_STATE);
  });
});

import { accuracyLevel } from '@/lib/format';
import type { GpsReading } from '@/types/plant-record';

// The first fix can take a few minutes out in the park, because with no phone signal the GPS chip
// has to download the satellite positions itself. After that we keep listening for a bit, since
// the first fixes are often the worst.
export const FIRST_FIX_TIMEOUT_MS = 3 * 60_000;
export const IMPROVE_FOR_MS = 30_000;
// Phones can hand back a fix they saved from earlier, which could be from somewhere else
// entirely. Anything older than this when the capture started gets skipped.
export const MAX_READING_AGE_MS = 10_000;
// How far behind the phone's clock we let the GPS clock be. See isFreshReading.
export const MAX_CLOCK_GAP_MS = 60_000;

/** The parts of an expo-location reading we use. Kept separate so the logic is easy to test. */
export type PhoneLocation = {
  coords: { latitude: number; longitude: number; accuracy: number | null };
  /** Milliseconds since 1970. */
  timestamp: number;
};

export type GpsStatus =
  /** Nothing captured yet. */
  | 'idle'
  /** Checking the permission and whether location is turned on. */
  | 'starting'
  /** Waiting for the first fix. */
  | 'searching'
  /** Got a fix, still waiting to see if a better one comes. */
  | 'improving'
  /** Location saved. */
  | 'done'
  | 'denied'
  /** The phone only gives an approximate location, which is no use for finding a plant again. */
  | 'approximate'
  | 'services-off'
  /** Gave up waiting for the first fix. */
  | 'no-fix'
  | 'error';

export type GpsState = {
  status: GpsStatus;
  /** The location the record will be saved with. */
  saved?: GpsReading;
  /** Best fix so far while capturing. */
  best?: GpsReading;
  /** When the current capture started, in milliseconds since 1970. */
  startedAt?: number;
  /** Timestamp of the first fix the phone sent in this capture, even a skipped one. */
  firstTimestamp?: number;
  /** False when the phone won't show the permission prompt again, so only Settings can fix it. */
  canAskAgain: boolean;
};

export type GpsEvent =
  | { type: 'start'; at: number }
  | { type: 'searching' }
  | { type: 'denied'; canAskAgain: boolean }
  | { type: 'approximate' }
  | { type: 'services-off' }
  | { type: 'location'; location: PhoneLocation }
  | { type: 'no-fix' }
  | { type: 'settle' }
  | { type: 'accept' }
  | { type: 'cancel' }
  | { type: 'error' }
  | { type: 'clear' };

export const INITIAL_GPS_STATE: GpsState = { status: 'idle', canAskAgain: true };

export function isCapturing(status: GpsStatus) {
  return status === 'starting' || status === 'searching' || status === 'improving';
}

/** Turns a phone reading into what a record stores, or undefined if the reading is no use. */
export function toGpsReading({ coords, timestamp }: PhoneLocation): GpsReading | undefined {
  const { latitude, longitude, accuracy } = coords;
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy < 0) {
    return undefined;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(timestamp)) {
    return undefined;
  }
  // The server turns down a record with a point that isn't on the globe (005), so a broken
  // reading like that would only fail later, once it's too late to take it again.
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return undefined;
  }
  return {
    latitude,
    longitude,
    // Rounded up, so we never say a reading is better than the phone thinks it is.
    accuracyM: Math.ceil(accuracy),
    capturedAt: new Date(timestamp).toISOString(),
  };
}

/**
 * Skips fixes the phone saved from before the capture started. Android stamps fixes with the GPS
 * clock, which can be a little off from the phone's own clock, so a fix that's newer than the
 * first one in this capture also counts as fresh. That only holds when the first fix is itself
 * from the last minute or so. A first fix from an hour ago is a saved one, and a second saved
 * fix from half an hour ago is newer than it but still from somewhere else.
 */
export function isFreshReading(timestamp: number, startedAt: number, firstTimestamp?: number) {
  if (timestamp >= startedAt - MAX_READING_AGE_MS) {
    return true;
  }
  return (
    firstTimestamp !== undefined &&
    firstTimestamp >= startedAt - MAX_CLOCK_GAP_MS &&
    timestamp > firstTimestamp
  );
}

/** Keeps the more accurate reading. On a tie the newer one wins. */
export function pickBetter(current: GpsReading | undefined, next: GpsReading) {
  if (!current) {
    return next;
  }
  return next.accuracyM <= current.accuracyM ? next : current;
}

function end(state: GpsState, status: GpsStatus, saved = state.saved): GpsState {
  return { status, saved, canAskAgain: true };
}

function addReading(state: GpsState, location: PhoneLocation): GpsState {
  const firstTimestamp = state.firstTimestamp ?? location.timestamp;
  const reading = toGpsReading(location);
  const fresh = isFreshReading(location.timestamp, state.startedAt ?? 0, state.firstTimestamp);
  if (!reading || !fresh) {
    return { ...state, firstTimestamp };
  }

  const best = pickBetter(state.best, reading);
  // 10 m or better is what the proposal asks for, so there's no point waiting any longer.
  if (accuracyLevel(best.accuracyM) === 'good') {
    return end(state, 'done', best);
  }
  return { ...state, status: 'improving', best, firstTimestamp };
}

/**
 * Every step of capturing a location. A retake keeps the old location until a new one is
 * accepted, so a failed retake never loses what was already there.
 */
export function gpsReducer(state: GpsState, event: GpsEvent): GpsState {
  switch (event.type) {
    case 'start':
      // A capture that's already running carries on, since starting again wouldn't restart it.
      return isCapturing(state.status)
        ? state
        : { status: 'starting', saved: state.saved, startedAt: event.at, canAskAgain: true };
    case 'searching':
      return state.status === 'starting' ? { ...state, status: 'searching' } : state;
    case 'denied':
      return state.status === 'starting'
        ? { ...end(state, 'denied'), canAskAgain: event.canAskAgain }
        : state;
    case 'approximate':
    case 'services-off':
      return state.status === 'starting' ? end(state, event.type) : state;
    case 'location':
      return state.status === 'searching' || state.status === 'improving'
        ? addReading(state, event.location)
        : state;
    case 'no-fix':
      return state.status === 'searching' ? end(state, 'no-fix') : state;
    case 'settle':
    case 'accept':
      return state.status === 'improving' && state.best ? end(state, 'done', state.best) : state;
    case 'cancel':
      if (!isCapturing(state.status)) {
        return state;
      }
      return end(state, state.saved ? 'done' : 'idle');
    case 'error':
      return isCapturing(state.status) ? end(state, 'error') : state;
    case 'clear':
      return INITIAL_GPS_STATE;
  }
}

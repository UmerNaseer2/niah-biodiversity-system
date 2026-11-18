import type { GpsReading, PlantCondition } from '@/types/plant-record';

// Dates are formatted by hand instead of with Intl so they come out the same on every phone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Times and dates are shown in park time (Sarawak, UTC+8), the same as the website, whatever time
// zone the phone is set to. So a record made at 9 am at the park says 9 am on every phone.
const PARK_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function parkMs(time: string | Date) {
  return (typeof time === 'string' ? Date.parse(time) : time.getTime()) + PARK_OFFSET_MS;
}

/** The clock at the park for this moment. Only read it with the getUTC methods. */
function parkClock(time: string | Date) {
  return new Date(parkMs(time));
}

/** Counts whole days at the park, so two times on the same park day get the same number. */
function parkDay(time: string | Date) {
  return Math.floor(parkMs(time) / DAY_MS);
}

/** When this day began at the park (midnight in Sarawak), as milliseconds like Date.now(). */
export function startOfParkDay(now = new Date()) {
  return parkDay(now) * DAY_MS - PARK_OFFSET_MS;
}

/** True when the record is from the same day at the park as now. */
export function isToday(iso: string, now = new Date()) {
  return parkDay(iso) === parkDay(now);
}

/** "9:41 am", in park time. */
export function formatTime(iso: string) {
  const clock = parkClock(iso);
  const hours = clock.getUTCHours();
  const minutes = String(clock.getUTCMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

/**
 * "Today, 9:41 am", "Yesterday, 3:20 pm", "1 Oct, 10:05 am", or "28 Dec 2025, 4:10 pm".
 * Today and Yesterday are park days, so they match the website.
 */
export function formatRecordedAt(iso: string, now = new Date()) {
  const daysAgo = parkDay(now) - parkDay(iso);
  if (daysAgo === 0) {
    return `Today, ${formatTime(iso)}`;
  }
  if (daysAgo === 1) {
    return `Yesterday, ${formatTime(iso)}`;
  }
  // The year only shows when it isn't this year, so a record from last December doesn't look
  // like it's from a few weeks ahead.
  const date = parkClock(iso);
  const thisYear = parkClock(now).getUTCFullYear();
  const year = date.getUTCFullYear() === thisYear ? '' : ` ${date.getUTCFullYear()}`;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}${year}, ${formatTime(iso)}`;
}

/** "3.81402° N, 113.77861° E" */
export function formatCoords({ latitude, longitude }: Pick<GpsReading, 'latitude' | 'longitude'>) {
  const lat = `${Math.abs(latitude).toFixed(5)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(longitude).toFixed(5)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}`;
}

export function formatHeight(heightM?: number) {
  return heightM === undefined ? 'Not measured' : `${heightM} m`;
}

export type AccuracyLevel = 'good' | 'ok' | 'poor';

/** The proposal's target: GPS readings within 10 m. */
export const GOOD_ACCURACY_M = 10;

/** The website's review queue flags any point over 15 m, so the phone calls those poor. */
export const OK_ACCURACY_M = 15;

// Up to 10 m is good, up to 15 m is ok, and over 15 m is poor. The website draws its line at the
// same 15 m, so a point the phone calls ok never turns up flagged in the review queue.
export function accuracyLevel(accuracyM: number): AccuracyLevel {
  if (accuracyM <= GOOD_ACCURACY_M) {
    return 'good';
  }
  if (accuracyM <= OK_ACCURACY_M) {
    return 'ok';
  }
  return 'poor';
}

/** plural(1, 'record') is "1 record", plural(3, 'record') is "3 records". */
export function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

export function conditionLabel(condition: PlantCondition) {
  return condition.charAt(0).toUpperCase() + condition.slice(1);
}

/** "2 Oct 2026", the day at the park (Sarawak, UTC+8) when this happened. */
export function formatParkDate(iso: string) {
  const date = parkClock(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

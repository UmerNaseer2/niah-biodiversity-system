import type { GpsReading, PlantCondition } from '@/types/plant-record';

// Dates are formatted by hand instead of with Intl so they come out the same on every phone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(iso: string, now = new Date()) {
  return sameDay(new Date(iso), now);
}

/** "9:41 am" */
export function formatTime(iso: string) {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

/** "Today, 9:41 am", "Yesterday, 3:20 pm" or "1 Oct, 10:05 am" */
export function formatRecordedAt(iso: string, now = new Date()) {
  const date = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(date, now)) {
    return `Today, ${formatTime(iso)}`;
  }
  if (sameDay(date, yesterday)) {
    return `Yesterday, ${formatTime(iso)}`;
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${formatTime(iso)}`;
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

// Rough cut offs for phone GPS under canopy. Item 8 can tune these after testing in the park.
export function accuracyLevel(accuracyM: number): AccuracyLevel {
  if (accuracyM <= 10) {
    return 'good';
  }
  if (accuracyM <= 25) {
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

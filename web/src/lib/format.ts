// Dates are kept in park time (Sarawak, UTC+8) with no offset, and we format
// them by hand so the server and the browser always print the same thing.
// Intl can differ between the two and cause hydration errors.

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PARK_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Supabase sends times in UTC, like "2026-10-11T10:30:00+00:00". This turns
 * one into park time with no offset, the same as the mock dates. It only
 * shifts a time we already have and never reads the clock.
 */
export function parkTime(iso: string) {
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(iso)) return iso;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms + PARK_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * The time at the park right now, with no offset. It reads the clock, so only
 * call it from a route handler or a server component that already waits for
 * the request (cookies or connection()). Never call it in a client component.
 */
export function parkNow() {
  return parkTime(new Date().toISOString());
}

function parts(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!match) throw new Error(`Not a date: ${iso}`);
  const [, year, month, day, hour = "0", minute = "0"] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
}

/** 2 Oct 2026 */
export function formatDate(iso: string) {
  const { year, month, day } = parts(iso);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Thursday 29 October 2026 */
export function formatLongDate(iso: string) {
  const { year, month, day } = parts(iso);
  const weekday = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${FULL_MONTHS[month - 1]} ${year}`;
}

/** 2:14 am */
export function formatTime(iso: string) {
  const { hour, minute } = parts(iso);
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/** 2 Oct, 2:14 am */
export function formatDateTime(iso: string) {
  const { month, day } = parts(iso);
  return `${day} ${MONTHS[month - 1]}, ${formatTime(iso)}`;
}

export function formatCoords(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** "1 tagged tree", "2 tagged trees" */
export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** [30, 31, 32] becomes "Items 30 to 32", [16, 18] becomes "Items 16 and 18" */
export function itemsLabel(items: number[]) {
  if (items.length === 1) return `Item ${items[0]}`;
  const inOrder = items.every((n, i) => i === 0 || n === items[i - 1] + 1);
  if (inOrder && items.length > 2) {
    return `Items ${items[0]} to ${items[items.length - 1]}`;
  }
  return `Items ${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

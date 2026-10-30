import { CONDITION_LABEL } from "./condition";
import { formatDate, formatTime, parkTime } from "./format";
import { IUCN, isIucnCode } from "./iucn";
import { STATUS_LABEL } from "./records-staff";
import { storedKey } from "./species-photos";
import type { createClient } from "./supabase/server";

// The history of changes to records and species (supabase/013). Every save
// that changes something adds a row with who saved it, when, and what each
// changed column was before and after. Where a plant is never goes in, only
// whether it had a spot before and after. Only officers and admins can read
// it, the same people who can edit.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** How many changes the edit pages show, newest first */
export const HISTORY_LIMIT = 50;

/** One line about what changed. Long text opens to show before and after. */
export type ChangeLine =
  | { kind: "short"; text: string }
  | { kind: "long"; text: string; from: string; to: string };

export type HistoryEntry = {
  id: string;
  /** The time it was saved, from the database */
  changedAt: string;
  /** Who saved it, or null for the Table Editor or the SQL editor */
  who: string | null;
  /** The name is kept after an account is deleted, but the link isn't */
  accountDeleted: boolean;
  changes: ChangeLine[];
};

export type History = { entries: HistoryEntry[]; more: boolean };

type Kind = "record" | "species";

type Column = {
  label: string;
  /** Turns a stored value into words. Columns without one use the value. */
  show?: (value: unknown) => string;
  /** Notes and the like go in a box that opens, since they can be long */
  long?: boolean;
  /** Says it changed without the values, which wouldn't mean anything */
  noValues?: boolean;
};

const yesNo = (value: unknown) => (value === true ? "Yes" : "No");

function parkDateTime(value: unknown) {
  if (typeof value !== "string") return text(value);
  const time = parkTime(value);
  try {
    return `${formatDate(time)}, ${formatTime(time)}`;
  } catch {
    return value;
  }
}

function labelled(labels: Record<string, string>) {
  return (value: unknown) =>
    typeof value === "string" && value in labels ? labels[value] : text(value);
}

const RECORD_COLUMNS: Record<string, Column> = {
  species_name: { label: "Species" },
  common_name: { label: "Common name" },
  species_slug: { label: "Species page" },
  height_m: {
    label: "Height",
    show: (value) => (typeof value === "number" ? `${value} m` : text(value)),
  },
  condition: {
    label: "Condition",
    show: labelled(CONDITION_LABEL),
  },
  recorded_at: { label: "Recorded on", show: parkDateTime },
  recorded_by: { label: "Recorded by" },
  notes: { label: "Notes", long: true },
  status: {
    label: "Status",
    show: labelled(STATUS_LABEL),
  },
  review_notes: { label: "Review notes", long: true },
  photo_count: { label: "Number of photos" },
  photo_urls: { label: "Photo links", noValues: true },
  submitted_by: { label: "Account that sent it", noValues: true },
  photo_folder: { label: "Photo folder", noValues: true },
  uploaded_at: { label: "Uploaded", show: parkDateTime },
};

const SPECIES_COLUMNS: Record<string, Column> = {
  scientific_name: { label: "Scientific name" },
  authority: { label: "Authority" },
  family: { label: "Family" },
  common_names: { label: "Common names" },
  iucn_code: {
    label: "IUCN Red List status",
    show: (value) => (isIucnCode(value) ? IUCN[value].label : text(value)),
  },
  sarawak_protected: { label: "Protected in Sarawak", show: yesNo },
  rough_area_only: {
    label: "On the public map",
    show: (value) => (value === true ? "Rough area only" : "Exact spot"),
  },
  summary: { label: "Summary", long: true },
  about: { label: "About", long: true },
  description: { label: "Description", long: true },
  habitat: { label: "Habitat", long: true },
  uses: { label: "Uses", long: true },
  niah_zone: { label: "Part of the park" },
  qr_uuid: { label: "Tree tag" },
  morphology: { label: "Leaves, bark, flowers and fruit", noValues: true },
};

/** The spots, which only say whether there was one before and after */
const SPOT_LABEL: Record<string, string> = {
  gps: "Location",
  coordinates_exact: "Exact spot",
  coordinates_rough: "Rough area",
};

/** "growth_habit" becomes "Growth habit" */
function humanised(column: string) {
  const words = column.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A stored value as words. Empty values are "", and lists are joined. */
function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => item.trim()).filter(Boolean).join(", ");
  }
  return JSON.stringify(value);
}

function isPlain(value: unknown) {
  return (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value) ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function spotLine(label: string, change: Record<string, unknown>): ChangeLine {
  const { had, has } = change;
  if (had && has) return { kind: "short", text: `${label} changed` };
  if (has) return { kind: "short", text: `${label} added` };
  return { kind: "short", text: `${label} taken off` };
}

function valueLine(column: Column, from: unknown, to: unknown): ChangeLine {
  const { label } = column;
  if (column.noValues) return { kind: "short", text: `${label} changed` };
  const show = column.show ?? text;
  const before = show(from);
  const after = show(to);

  if (column.long) {
    if (!before) return { kind: "long", text: `${label} added`, from: "", to: after };
    if (!after) {
      return { kind: "long", text: `${label} taken off`, from: before, to: "" };
    }
    return { kind: "long", text: `${label} changed`, from: before, to: after };
  }
  if (!before) return { kind: "short", text: `${label} set to ${after}` };
  if (!after) return { kind: "short", text: `${label} taken off (was ${before})` };
  return { kind: "short", text: `${label} changed from ${before} to ${after}` };
}

/** “A leaf”, or nothing for a photo with no caption */
function quoted(photo: Record<string, unknown>) {
  const caption = text(photo.caption);
  return caption ? ` (“${caption}”)` : "";
}

/** The photo the public pages lead with: the one marked main, or the first */
function mainKey(photos: { key: string; photo: Record<string, unknown> }[]) {
  return (photos.find(({ photo }) => photo.isPrimary === true) ?? photos[0])?.key;
}

/** What happened to a species' photos, by matching them up by file or link */
function photoLines(from: unknown, to: unknown, slug: string): ChangeLine[] {
  const keyed = (value: unknown) =>
    (Array.isArray(value) ? value : []).flatMap((item) => {
      const photo = asObject(item);
      const key = photo && storedKey(photo, slug);
      return photo && key ? [{ key, photo }] : [];
    });
  const before = keyed(from);
  const after = keyed(to);
  const beforeByKey = new Map(before.map((entry) => [entry.key, entry.photo]));
  const afterKeys = new Set(after.map((entry) => entry.key));
  const lines: string[] = [];

  for (const { key, photo } of after) {
    const old = beforeByKey.get(key);
    if (!old) {
      lines.push(`Photo added${quoted(photo)}`);
      continue;
    }
    const oldCaption = text(old.caption);
    const newCaption = text(photo.caption);
    if (oldCaption !== newCaption) {
      lines.push(
        `Photo caption changed from “${oldCaption}” to “${newCaption}”`,
      );
    }
    if (text(old.credit) !== text(photo.credit)) {
      lines.push(
        `Photo credit${quoted(photo)} changed from ${text(old.credit) || "nothing"} ` +
          `to ${text(photo.credit) || "nothing"}`,
      );
    }
  }
  for (const { key, photo } of before) {
    if (!afterKeys.has(key)) lines.push(`Photo removed${quoted(photo)}`);
  }

  const newMain = mainKey(after);
  const oldMain = mainKey(before);
  if (newMain && oldMain && newMain !== oldMain && beforeByKey.has(newMain)) {
    const photo = after.find((entry) => entry.key === newMain)!.photo;
    lines.push(`Main photo changed to the one${quoted(photo) || " without a caption"}`);
  }
  if (lines.length === 0) lines.push("Photos changed");
  return lines.map((line) => ({ kind: "short", text: line }));
}

/**
 * What a history row's changes say, as lines in the order the form shows
 * the fields. Anything the website doesn't know about still gets a line, so
 * a change made in the Table Editor shows up too.
 */
export function describeChanges(
  kind: Kind,
  changes: unknown,
  slug: string,
): ChangeLine[] {
  const all = asObject(changes);
  if (!all) return [];
  const known = kind === "record" ? RECORD_COLUMNS : SPECIES_COLUMNS;
  const order = [...Object.keys(known), ...Object.keys(SPOT_LABEL)];
  const columns = Object.keys(all).sort((a, b) => {
    const rank = (column: string) =>
      order.includes(column) ? order.indexOf(column) : order.length;
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  return columns.flatMap((column) => {
    const change = asObject(all[column]);
    if (!change) return [];
    if (column in SPOT_LABEL && "had" in change) {
      return [spotLine(SPOT_LABEL[column], change)];
    }
    if (kind === "species" && column === "photos") {
      return photoLines(change.from, change.to, slug);
    }
    const details = known[column] ?? {
      label: humanised(column),
      noValues: !isPlain(change.from) || !isPlain(change.to),
    };
    return [valueLine(details, change.from, change.to)];
  });
}

/**
 * The newest changes to one record or species, read as the person signed in.
 * Gives null if the history didn't load, which is also what happens before
 * 013 has been run.
 */
export async function loadHistory(
  supabase: Supabase,
  kind: Kind,
  id: string,
): Promise<History | null> {
  const query =
    kind === "record"
      ? supabase.from("record_history").select("*").eq("record_id", id)
      : supabase.from("species_history").select("*").eq("species_id", id);
  const { data, error } = await query
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT + 1);

  if (error) {
    console.error(`Loading the ${kind} history failed:`, error.message);
    return null;
  }
  const entries = data.slice(0, HISTORY_LIMIT).map((row) => {
    const name = typeof row.changed_by_name === "string" ? row.changed_by_name : null;
    return {
      id: String(row.id),
      changedAt: String(row.changed_at),
      who: name,
      accountDeleted: name !== null && !row.changed_by,
      changes: describeChanges(kind, row.changes, id),
    };
  });
  return { entries, more: data.length > HISTORY_LIMIT };
}

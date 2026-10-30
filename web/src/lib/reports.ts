import { hidesLocation, type Species } from "@/data/species";
import { CONDITION_LABEL, type Condition } from "./condition";
import { formatDate } from "./format";
import { IUCN, type IucnCode } from "./iucn";
import type { StaffRecord } from "./records-staff";

// Reports (item 21). The reports page and the CSV route both start from
// records_staff and species_staff with the same filters. The database counts
// the records for the page (report_counts in supabase/012) and reportRecords
// below builds the rows of the file, with the same rules, so the charts and
// the file always count the same records.

export type ReportScope = "published" | "all";

export const SCOPE_LABEL: Record<ReportScope, string> = {
  published: "Published only",
  all: "Published and waiting for review",
};

export type ReportFilters = {
  scope: ReportScope;
  /** First day in park time, like 2026-10-01, or null for no limit */
  from: string | null;
  /** Last day in park time, kept in the report */
  to: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(value: unknown) {
  return typeof value === "string" && DAY.test(value) ? value : null;
}

/** Reads the filters from a page's searchParams or the CSV link's query */
export function filtersFrom(params: Record<string, unknown>): ReportFilters {
  let from = day(params.from);
  let to = day(params.to);
  // Someone who picks the dates the wrong way round still gets the days between
  if (from && to && from > to) [from, to] = [to, from];
  return { scope: params.scope === "all" ? "all" : "published", from, to };
}

/**
 * Which page of the downloads with exact spots to show, from ?downloads=2.
 * Page 1 is the newest, and anything that isn't a page number gives that.
 */
export function downloadPageFrom(params: Record<string, unknown>) {
  const page = typeof params.downloads === "string" ? Number(params.downloads) : 1;
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/** The same filters as a query string, for the CSV link */
export function filtersQuery(filters: ReportFilters) {
  const query = new URLSearchParams();
  if (filters.scope === "all") query.set("scope", "all");
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  return query;
}

export type ReportRecord = {
  id: string;
  code: string;
  /** Null when the field team hasn't matched it to a species on our list yet */
  speciesSlug: string | null;
  commonName: string | null;
  /** The species' scientific name, or what the field team wrote down */
  scientificName: string;
  family: string | null;
  iucn: IucnCode | null;
  /** Threatened on the Red List or protected in Sarawak */
  threatened: boolean;
  /** Same rule as the public pages. A plant with no species stays hidden too. */
  hidesLocation: boolean;
  status: "published" | "waiting";
  heightM: number | null;
  condition: Condition;
  recordedBy: string | null;
  /** Park time, like 2026-10-12T16:05 */
  recordedAt: string;
  gps: { lat: number; lng: number; accuracyM: number } | null;
  notes: string | null;
};

/**
 * The records a report covers, newest first. Rejected records never count,
 * since they aren't plants we know are there, and waiting ones only count
 * when the scope says so.
 */
export function reportRecords(
  records: StaffRecord[],
  species: Species[],
  filters: ReportFilters,
): ReportRecord[] {
  const bySlug = new Map(species.map((s) => [s.slug, s]));
  const rows: ReportRecord[] = [];
  for (const record of records) {
    if (record.status === "rejected") continue;
    if (record.status === "waiting" && filters.scope !== "all") continue;
    const recordedOn = record.recordedAt.slice(0, 10);
    if (filters.from && recordedOn < filters.from) continue;
    if (filters.to && recordedOn > filters.to) continue;

    const plant = record.speciesSlug ? bySlug.get(record.speciesSlug) : undefined;
    rows.push({
      id: record.id,
      code: record.tagCode,
      speciesSlug: plant?.slug ?? null,
      commonName: plant?.commonNames[0] ?? record.commonName,
      scientificName: plant?.scientificName ?? record.speciesName,
      family: plant?.family || null,
      iucn: plant?.iucn ?? null,
      threatened: plant ? IUCN[plant.iucn].threatened || plant.sarawakProtected : false,
      hidesLocation: plant ? hidesLocation(plant) : true,
      status: record.status,
      heightM: record.heightM,
      condition: record.condition,
      recordedBy: record.recordedBy,
      recordedAt: record.recordedAt,
      gps: record.gps
        ? { lat: record.gps.lat, lng: record.gps.lng, accuracyM: record.gps.accuracyM }
        : null,
      notes: record.notes,
    });
  }
  return rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export type Count = { key: string; label: string; count: number };

export const NOT_MATCHED = "Not matched to a species yet";

const MONTHS = [
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

/** "2026-10" becomes "October 2026" */
export function monthLabel(month: string) {
  const [year, number] = month.split("-");
  return `${MONTHS[Number(number) - 1]} ${year}`;
}

const CONDITIONS = Object.keys(CONDITION_LABEL) as Condition[];

export type MonthRow = {
  month: string;
  label: string;
  total: number;
  byCondition: Record<Condition, number>;
};

/**
 * What report_counts (supabase/012_report_counts.sql) gives back. The counts
 * by IUCN code, condition and species ID leave out anything with no records,
 * and "none" is plants not matched to a species yet. Times are park time.
 */
export type ReportCounts = {
  total: number;
  waiting: number;
  species_count: number;
  not_matched: number;
  threatened: number;
  needs_care: number;
  hidden_spots: number;
  first: string | null;
  last: string | null;
  by_iucn: Record<string, number>;
  by_condition: Record<string, number>;
  by_species: Record<string, number>;
  /** By month, like "2026-10", then by condition */
  by_month: Record<string, Record<string, number>>;
};

export type ReportSummary = {
  total: number;
  waiting: number;
  speciesCount: number;
  notMatched: number;
  threatened: number;
  needsCare: number;
  /** How many rows of the file say Hidden unless exact spots are included */
  hiddenSpots: number;
  /** Most to least at risk, then DD and NE, then plants with no species. Zeros stay in. */
  byIucn: Count[];
  /** All four conditions, zeros included */
  byCondition: Count[];
  /** Most records first */
  bySpecies: Count[];
  /** Oldest month first */
  byMonth: MonthRow[];
  first: string | null;
  last: string | null;
};

const IUCN_RISK: IucnCode[] = ["CR", "EN", "VU", "NT", "LC", "DD", "NE"];

/** Puts the database's counts in the order and words the page shows */
export function summaryFromCounts(counts: ReportCounts, species: Species[]): ReportSummary {
  const byIucn: Count[] = IUCN_RISK.map((code) => ({
    key: code,
    label: IUCN[code].label,
    count: counts.by_iucn[code] ?? 0,
  }));
  if (counts.not_matched > 0) {
    byIucn.push({ key: "none", label: NOT_MATCHED, count: counts.not_matched });
  }

  const bySlug = new Map(species.map((s) => [s.slug, s]));
  const bySpecies = Object.entries(counts.by_species)
    .map(([key, count]): Count => {
      const plant = bySlug.get(key);
      const label =
        key === "none"
          ? NOT_MATCHED
          : !plant
            ? key
            : plant.commonNames[0]
              ? `${plant.commonNames[0]} (${plant.scientificName})`
              : plant.scientificName;
      return { key, label, count };
    })
    .sort(
      (a, b) =>
        // Plants with no species go last, whatever their count
        Number(a.key === "none") - Number(b.key === "none") ||
        b.count - a.count ||
        a.label.localeCompare(b.label),
    );

  const byMonth = Object.entries(counts.by_month)
    .map(([month, conditions]): MonthRow => {
      const byCondition = Object.fromEntries(
        CONDITIONS.map((c) => [c, conditions[c] ?? 0]),
      ) as Record<Condition, number>;
      const total = CONDITIONS.reduce((sum, c) => sum + byCondition[c], 0);
      return { month, label: monthLabel(month), total, byCondition };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    total: counts.total,
    waiting: counts.waiting,
    speciesCount: counts.species_count,
    notMatched: counts.not_matched,
    threatened: counts.threatened,
    needsCare: counts.needs_care,
    hiddenSpots: counts.hidden_spots,
    byIucn,
    byCondition: CONDITIONS.map((c) => ({
      key: c,
      label: CONDITION_LABEL[c],
      count: counts.by_condition[c] ?? 0,
    })),
    bySpecies,
    byMonth,
    first: counts.first,
    last: counts.last,
  };
}

/** "10 Oct 2026 to 12 Oct 2026", or one day when they match */
export function rangeLabel(first: string, last: string) {
  const a = formatDate(first);
  const b = formatDate(last);
  return a === b ? a : `${a} to ${b}`;
}

/** The days the filters pick: "any date", "from 1 Oct 2026", and so on */
export function datesLabel({ from, to }: ReportFilters) {
  if (from && to) return rangeLabel(from, to);
  if (from) return `from ${formatDate(from)}`;
  if (to) return `up to ${formatDate(to)}`;
  return "any date";
}

// The CSV file

export const CSV_HEADERS = [
  "Tag code",
  "Common name",
  "Scientific name",
  "Family",
  "IUCN status",
  "Threatened or protected",
  "Review status",
  "Height (m)",
  "Condition",
  "Recorded by",
  "Recorded at",
  "Location",
  "Latitude",
  "Longitude",
  "GPS accuracy (m)",
  "Notes",
];

// Spaces before the sign don't stop some spreadsheets, and neither do the full
// width signs a phone keyboard can type, so they count too.
const FORMULA_START = /^\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r]/;

/**
 * One CSV cell. Text starting with =, +, -, @ or a tab gets a ' in front so
 * Excel shows it instead of running it as a formula, since names and notes
 * come from whatever the field team typed.
 */
export function csvCell(value: string | number | null) {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type LocationInFile = "Exact" | "Hidden" | "No GPS point";

export function locationOf(row: ReportRecord, includeExact: boolean): LocationInFile {
  if (!row.gps) return "No GPS point";
  if (row.hidesLocation && !includeExact) return "Hidden";
  return "Exact";
}

/** How many rows say Hidden unless the exact spots are included */
export function hiddenSpotCount(rows: ReportRecord[]) {
  return rows.filter((row) => locationOf(row, false) === "Hidden").length;
}

/**
 * The whole file. Rows of threatened and protected plants only get their
 * coordinates when includeExact is set. Starts with a BOM so Excel opens it
 * as UTF-8.
 */
export function buildCsv(rows: ReportRecord[], includeExact: boolean) {
  const lines = rows.map((row) => {
    const location = locationOf(row, includeExact);
    const point = location === "Exact" ? row.gps : null;
    return [
      row.code,
      row.commonName,
      row.scientificName,
      row.family,
      row.iucn ? `${IUCN[row.iucn].label} (${row.iucn})` : NOT_MATCHED,
      row.threatened ? "Yes" : "No",
      row.status === "published" ? "Published" : "Waiting for review",
      row.heightM,
      CONDITION_LABEL[row.condition],
      row.recordedBy,
      // Spreadsheets sort "2026-10-02 10:24" properly, so the file gets that
      row.recordedAt.replace("T", " "),
      location,
      point?.lat ?? null,
      point?.lng ?? null,
      point?.accuracyM ?? null,
      row.notes,
    ]
      .map(csvCell)
      .join(",");
  });
  return `\uFEFF${[CSV_HEADERS.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}


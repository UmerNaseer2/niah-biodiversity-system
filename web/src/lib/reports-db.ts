import { parkTime } from "./format";
import { recordFromRow } from "./records-staff";
import {
  hiddenSpotCount,
  reportRecords,
  summaryFromCounts,
  type ReportCounts,
  type ReportFilters,
  type ReportRecord,
  type ReportScope,
  type ReportSummary,
} from "./reports";
import { speciesFromRow } from "./species-db";
import { readAll } from "./supabase/read-all";
import { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Midnight at the start of a park day, which is 16:00 UTC the day before */
function dayStart(day: string) {
  return `${day}T00:00:00+08:00`;
}

/** "2026-10-31" becomes "2026-11-01" */
function nextDay(day: string) {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

/**
 * The records the filters cover, newest first, so the database skips the
 * rest. reportRecords checks the same filters again on what comes back.
 */
function coveredRecords(supabase: Supabase, filters: ReportFilters, count?: "exact") {
  let query = supabase
    .from("records_staff")
    .select("*", count ? { count } : undefined)
    .in("status", filters.scope === "all" ? ["published", "waiting"] : ["published"]);
  if (filters.from) query = query.gte("recorded_at", dayStart(filters.from));
  if (filters.to) query = query.lt("recorded_at", dayStart(nextDay(filters.to)));
  return query.order("recorded_at", { ascending: false }).order("id");
}

function readSpecies(supabase: Supabase) {
  return readAll((from, to) =>
    supabase.from("species_staff").select("*", { count: "exact" }).order("id").range(from, to),
  );
}

/**
 * The records a report covers, read as the person signed in, for the CSV.
 * Both views only answer officers and admins (supabase/006 and 007), so
 * callers check the role first and the database checks it again. Gives null
 * if a query fails.
 */
export async function loadReportRecords(
  filters: ReportFilters,
): Promise<ReportRecord[] | null> {
  const supabase = await createClient();
  const [records, species] = await Promise.all([
    readAll((from, to) => coveredRecords(supabase, filters, "exact").range(from, to)),
    readSpecies(supabase),
  ]);
  if (records.error || species.error) {
    console.error("Loading the report failed:", (records.error ?? species.error)?.message);
    return null;
  }
  return reportRecords(
    records.data.map(recordFromRow),
    species.data.map(speciesFromRow),
    filters,
  );
}

/**
 * What the Reports page shows: the counts, which the database works out
 * (supabase/012_report_counts.sql), and only the newest few rows for the
 * preview, so the page doesn't load every record just to count them. Same
 * roles as loadReportRecords. Gives null if a query fails, like when 012
 * hasn't been run yet.
 */
export async function loadReport(
  filters: ReportFilters,
  previewRows: number,
): Promise<{ summary: ReportSummary; preview: ReportRecord[] } | null> {
  const supabase = await createClient();
  const [counts, species, records] = await Promise.all([
    supabase.rpc("report_counts", {
      scope: filters.scope,
      from_day: filters.from,
      to_day: filters.to,
    }),
    readSpecies(supabase),
    coveredRecords(supabase, filters).limit(previewRows),
  ]);
  if (counts.error || species.error || records.error) {
    const error = counts.error ?? species.error ?? records.error;
    console.error("Loading the report failed:", error?.message);
    return null;
  }
  const list = species.data.map(speciesFromRow);
  return {
    summary: summaryFromCounts(counts.data as ReportCounts, list),
    preview: reportRecords(records.data.map(recordFromRow), list, filters),
  };
}

/**
 * Adds a row to the list of downloads with exact spots
 * (supabase/011_exact_location_downloads.sql) before the file goes out. Only
 * the filters and counts are sent, since the database fills in who and when
 * itself. Gives false if the row didn't go in, and then the file isn't sent.
 */
export async function recordExactDownload(filters: ReportFilters, rows: ReportRecord[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("exact_location_downloads").insert({
    scope: filters.scope,
    from_day: filters.from,
    to_day: filters.to,
    row_count: rows.length,
    exact_count: hiddenSpotCount(rows),
  });
  if (error) {
    console.error("Recording a download with exact spots failed:", error.message);
    return false;
  }
  return true;
}

export type ExactDownload = {
  id: number;
  /** Park time, like 2026-10-30T09:15 */
  downloadedAt: string;
  downloadedBy: string;
  filters: ReportFilters;
  rowCount: number;
  exactCount: number;
};

// Plenty for an admin checking who took the exact spots lately. Older ones
// are on the next page.
export const DOWNLOADS_PER_PAGE = 20;

const DOWNLOAD_COLUMNS =
  "id, downloaded_at, downloaded_by_name, scope, from_day, to_day, row_count, exact_count";

export type DownloadPage = {
  downloads: ExactDownload[];
  /** 1 is the newest */
  page: number;
  /** True when there are older downloads than these */
  hasOlder: boolean;
};

/**
 * One page of the downloads with exact spots, newest first. It asks for one
 * row more than a page holds to know if there are older ones. Only admins get
 * rows back (an officer gets an empty list). Gives null if the query fails,
 * like when 011 hasn't been run yet.
 */
export async function loadExactDownloads(page: number): Promise<DownloadPage | null> {
  const supabase = await createClient();
  const from = (page - 1) * DOWNLOADS_PER_PAGE;
  const { data, error } = await supabase
    .from("exact_location_downloads")
    .select(DOWNLOAD_COLUMNS)
    .order("downloaded_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + DOWNLOADS_PER_PAGE);
  if (error) {
    console.error("Loading the downloads with exact spots failed:", error.message);
    return null;
  }
  const downloads = data.slice(0, DOWNLOADS_PER_PAGE).map((row) => ({
    id: Number(row.id),
    downloadedAt: parkTime(String(row.downloaded_at)),
    downloadedBy: String(row.downloaded_by_name),
    filters: {
      scope: row.scope as ReportScope,
      from: row.from_day ? String(row.from_day) : null,
      to: row.to_day ? String(row.to_day) : null,
    },
    rowCount: Number(row.row_count),
    exactCount: Number(row.exact_count),
  }));
  return { downloads, page, hasOlder: data.length > DOWNLOADS_PER_PAGE };
}

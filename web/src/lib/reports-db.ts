import { parkTime } from "./format";
import { recordFromRow } from "./records-staff";
import {
  hiddenSpotCount,
  reportRecords,
  type ReportFilters,
  type ReportRecord,
  type ReportScope,
} from "./reports";
import { speciesFromRow } from "./species-db";
import { readAll } from "./supabase/read-all";
import { createClient } from "./supabase/server";

/**
 * The records a report covers, read as the person signed in. Both views only
 * answer officers and admins (supabase/006 and 007), so callers check the
 * role first and the database checks it again. Gives null if a query fails.
 */
export async function loadReportRecords(
  filters: ReportFilters,
): Promise<ReportRecord[] | null> {
  const supabase = await createClient();
  const [records, species] = await Promise.all([
    readAll((from, to) =>
      supabase
        .from("records_staff")
        .select("*", { count: "exact" })
        .order("recorded_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase.from("species_staff").select("*", { count: "exact" }).order("id").range(from, to),
    ),
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

// Plenty for an admin checking who took the exact spots lately
const RECENT_DOWNLOADS = 20;

const DOWNLOAD_COLUMNS =
  "id, downloaded_at, downloaded_by_name, scope, from_day, to_day, row_count, exact_count";

/**
 * The latest downloads with exact spots, newest first. Only admins get rows
 * back (an officer gets an empty list). Gives null if the query fails, like
 * when 011 hasn't been run yet.
 */
export async function loadExactDownloads(): Promise<ExactDownload[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exact_location_downloads")
    .select(DOWNLOAD_COLUMNS)
    .order("downloaded_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(RECENT_DOWNLOADS);
  if (error) {
    console.error("Loading the downloads with exact spots failed:", error.message);
    return null;
  }
  return data.map((row) => ({
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
}

import { recordFromRow } from "./records-staff";
import { reportRecords, type ReportFilters, type ReportRecord } from "./reports";
import { speciesFromRow } from "./species-db";
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
    supabase.from("records_staff").select("*").order("recorded_at", { ascending: false }),
    supabase.from("species_staff").select("*"),
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

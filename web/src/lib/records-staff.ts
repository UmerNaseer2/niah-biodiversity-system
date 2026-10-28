import type { Condition } from "./condition";
import { parkTime } from "./format";
import { tagCode } from "./tags";
import type { Values } from "./record-form";

/**
 * A plant record as the staff see it, from the records_staff view. Unlike the
 * public view it has the exact spot, the notes and who recorded it, and it
 * has records of every status. The view only answers officers and admins
 * (supabase/006).
 */
export type StaffRecord = {
  id: string;
  tagCode: string;
  speciesSlug: string | null;
  speciesName: string;
  commonName: string | null;
  heightM: number | null;
  condition: Condition;
  photoCount: number;
  gps: { lat: number; lng: number; accuracyM: number; capturedAt?: string } | null;
  notes: string | null;
  recordedBy: string | null;
  /** Park time with no offset, like the mock dates */
  recordedAt: string;
  status: "published" | "waiting" | "rejected";
  reviewedBy: string | null;
  /** Park time of the last edit, or null when it hasn't been edited since upload (008) */
  updatedAt: string | null;
};

export const STAFF_STATUSES = ["waiting", "published", "rejected"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const STATUS_LABEL: Record<StaffStatus, string> = {
  waiting: "Waiting for review",
  published: "Published",
  rejected: "Rejected",
};

// updated_at starts out the same as uploaded_at, so only a later time means an edit
function wasEdited(row: Record<string, unknown>) {
  if (!row.updated_at || !row.uploaded_at) return false;
  return Date.parse(String(row.updated_at)) - Date.parse(String(row.uploaded_at)) > 1000;
}

export function recordFromRow(row: Record<string, unknown>): StaffRecord {
  const id = String(row.id);
  return {
    id,
    tagCode: row.tag_code ? String(row.tag_code) : tagCode(id),
    speciesSlug: row.species_slug ? String(row.species_slug) : null,
    speciesName: String(row.species_name ?? ""),
    commonName: row.common_name ? String(row.common_name) : null,
    heightM: row.height_m == null ? null : Number(row.height_m),
    condition: row.condition as Condition,
    photoCount: Number(row.photo_count ?? 0),
    gps: (row.gps as StaffRecord["gps"]) ?? null,
    notes: row.notes ? String(row.notes) : null,
    recordedBy: row.recorded_by ? String(row.recorded_by) : null,
    recordedAt: parkTime(String(row.recorded_at)),
    status: row.status as StaffRecord["status"],
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    updatedAt: wasEdited(row) ? parkTime(String(row.updated_at)) : null,
  };
}

export function valuesFromRecord(record: StaffRecord): Values {
  return {
    speciesName: record.speciesName,
    commonName: record.commonName ?? "",
    height: record.heightM == null ? "" : String(record.heightM),
    condition: record.condition,
    notes: record.notes ?? "",
    recordedAt: record.recordedAt,
    lat: record.gps ? String(record.gps.lat) : "",
    lng: record.gps ? String(record.gps.lng) : "",
    accuracy: record.gps ? String(record.gps.accuracyM) : "",
  };
}

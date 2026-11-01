import type { Condition } from "./condition";
import { parkTime } from "./format";
import { roughCentre } from "./geo";
import { publicClient } from "./supabase";
import { readAll } from "./supabase/read-all";
import { tagCode } from "./tags";
import {
  findPublishedByTag,
  publishedForSpecies,
  publishedRecords,
  type PlantRecord,
} from "@/data/records";
import { getSpecies, hidesLocation, species as mockSpecies } from "@/data/species";

/**
 * An approved record as the public sees it, from the records_public view. The
 * view only gives the exact spot when the species shows it, and the middle of
 * the grid square for every other plant, including one with no species yet.
 */
export type PublicRecord = {
  id: string;
  tagCode: string;
  /** Null until the field team matches the plant to a species on our list */
  speciesSlug: string | null;
  speciesName: string;
  commonName: string | null;
  heightM: number | null;
  condition: Condition;
  photoCount: number;
  gps: { lat: number; lng: number; accuracyM: number } | null;
  /** Park time with no offset, like the mock dates */
  recordedAt: string;
};

// Only the columns the public pages show. Supabase drops the spaces and line
// breaks before it sends the query.
const COLUMNS = `id, tag_code, species_slug, species_name, common_name, height_m,
  condition, photo_count, recorded_at, gps`;

function fromRow(row: Record<string, unknown>): PublicRecord {
  const id = String(row.id);
  return {
    id,
    tagCode: row.tag_code ? String(row.tag_code) : tagCode(id),
    speciesSlug: row.species_slug ? String(row.species_slug) : null,
    speciesName: String(row.species_name ?? ""),
    commonName: row.common_name ? String(row.common_name) : null,
    // Supabase sends numeric columns as numbers, but a string works too
    heightM: row.height_m == null ? null : Number(row.height_m),
    condition: row.condition as Condition,
    photoCount: Number(row.photo_count ?? 0),
    gps: (row.gps as PublicRecord["gps"]) ?? null,
    recordedAt: parkTime(String(row.recorded_at)),
  };
}

// A sample record, given out the same way the view would give it
function fromMock(record: PlantRecord): PublicRecord {
  const plant = getSpecies(record.speciesSlug);
  const hidden = !plant || hidesLocation(plant);
  return {
    id: record.id,
    tagCode: tagCode(record.id),
    speciesSlug: record.speciesSlug,
    speciesName: plant?.scientificName ?? record.speciesSlug,
    commonName: plant?.commonNames[0] ?? null,
    heightM: record.heightM,
    condition: record.condition,
    photoCount: record.photoCount,
    gps:
      record.gps && hidden
        ? { ...roughCentre(record.gps.lat, record.gps.lng), accuracyM: 440 }
        : record.gps,
    recordedAt: record.recordedAt,
  };
}

function newestFirst(a: PublicRecord, b: PublicRecord) {
  return b.recordedAt.localeCompare(a.recordedAt);
}

// With Supabase set up, a failed query throws so the page shows its error
// screen. Showing the sample data instead would hide that the database is down.

/** How many approved records each species has, keyed by slug */
export async function getPublishedCounts(): Promise<Record<string, number>> {
  const client = await publicClient();
  if (!client) {
    return Object.fromEntries(
      mockSpecies.map((s) => [s.slug, publishedForSpecies(s.slug).length]),
    );
  }

  const { data, error } = await readAll((from, to) =>
    client
      .from("records_public")
      .select("species_slug", { count: "exact" })
      .eq("status", "published")
      .order("id")
      .range(from, to),
  );
  if (error) throw new Error(`Couldn't load the record counts: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data) {
    // A plant with no species yet doesn't count towards any species
    if (!row.species_slug) continue;
    const slug = String(row.species_slug);
    counts[slug] = (counts[slug] ?? 0) + 1;
  }
  return counts;
}

/** The approved records of one species, newest first */
export async function getPublishedRecordsForSpecies(slug: string): Promise<PublicRecord[]> {
  const client = await publicClient();
  if (!client) return publishedForSpecies(slug).map(fromMock).sort(newestFirst);

  const { data, error } = await readAll((from, to) =>
    client
      .from("records_public")
      .select(COLUMNS, { count: "exact" })
      .eq("species_slug", slug)
      .eq("status", "published")
      .order("recorded_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (error) throw new Error(`Couldn't load the records for ${slug}: ${error.message}`);
  return data.map(fromRow);
}

/** The newest approved records, for the home page */
export async function getRecentPublished(limit = 4): Promise<PublicRecord[]> {
  const client = await publicClient();
  if (!client) return publishedRecords.map(fromMock).sort(newestFirst).slice(0, limit);

  const { data, error } = await client
    .from("records_public")
    .select(COLUMNS)
    .eq("status", "published")
    .order("recorded_at", { ascending: false })
    // Hidden plants all get midnight, so on a day this keeps them from
    // following whatever order the database feels like
    .order("id")
    .limit(limit);
  if (error) throw new Error(`Couldn't load the newest records: ${error.message}`);
  return data.map(fromRow);
}

/** The approved record with this tag code (like NNP-3F2A9C), or null */
export async function getPublishedByTag(code: string): Promise<PublicRecord | null> {
  const client = await publicClient();
  if (!client) {
    const record = findPublishedByTag(code);
    return record ? fromMock(record) : null;
  }

  const { data, error } = await client
    .from("records_public")
    .select(COLUMNS)
    .eq("tag_code", code)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`Couldn't load tag ${code}: ${error.message}`);
  return data ? fromRow(data) : null;
}

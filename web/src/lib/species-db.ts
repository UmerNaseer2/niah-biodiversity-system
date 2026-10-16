import { supabase, isSupabaseConfigured } from "./supabase";
import { species as mockSpecies, type Species } from "@/data/species";
import { records as mockRecords, type PlantRecord } from "@/data/records";
import { isIucnCode } from "@/lib/iucn";

/**
 * Normalizes a Supabase PostgreSQL row into the application Species format
 */
export function speciesFromRow(row: Record<string, unknown>): Species {
  const iucn = row.iucn_code ?? row.iucn;
  return {
    slug: String(row.slug || row.id || ""),
    scientificName: String(row.scientific_name || row.scientificName || ""),
    authority: String(row.authority || ""),
    family: String(row.family || ""),
    commonNames: Array.isArray(row.common_names)
      ? (row.common_names as string[])
      : Array.isArray(row.commonNames)
      ? (row.commonNames as string[])
      : [],
    // The table only takes these codes, but if one ever doesn't match, Not
    // Evaluated is the honest thing to show
    iucn: isIucnCode(iucn) ? iucn : "NE",
    sarawakProtected: Boolean(
      row.sarawak_protected ?? row.sarawakProtected ?? false
    ),
    newerName: (row.newer_name || row.newerName) ? String(row.newer_name || row.newerName) : undefined,
    roughAreaOnly: Boolean(row.rough_area_only ?? row.roughAreaOnly ?? false),
    summary: String(row.summary || ""),
    about: String(row.about || row.description || ""),
    habitat: String(row.habitat || ""),
    uses: String(row.uses || ""),
    updated: row.updated_at
      ? String(row.updated_at).split("T")[0]
      : String(row.updated || "2026-10-02"),
  };
}

/**
 * Normalizes a Supabase PostgreSQL record row into the PlantRecord format
 */
function mapRowToRecord(row: Record<string, unknown>): PlantRecord {
  return {
    id: String(row.id || ""),
    speciesSlug: String(row.species_slug || row.speciesSlug || ""),
    heightM: Number(row.height_m ?? row.heightM ?? 0),
    condition: (row.condition as PlantRecord["condition"]) || "healthy",
    photoCount: Number(row.photo_count ?? row.photoCount ?? 0),
    gps: (row.gps as PlantRecord["gps"]) || null,
    notes: row.notes ? String(row.notes) : undefined,
    recordedBy: String(row.recorded_by || row.recordedBy || "field_botanist"),
    recordedAt: String(row.recorded_at || row.recordedAt || new Date().toISOString()),
    status: (row.status as PlantRecord["status"]) || "waiting",
  };
}

/**
 * Retrieves the full list of plant species.
 * Fetches from Supabase if configured, otherwise falls back to local mock data.
 */
export async function getSpeciesList(): Promise<Species[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("species_public")
        .select("*")
        .order("scientific_name", { ascending: true });

      if (!error && data) {
        return data.map(speciesFromRow);
      }
    } catch {
      // Graceful fallback to mock data on network/connection failure
    }
  }

  return mockSpecies;
}

/**
 * Retrieves a single species by its URL slug.
 */
export async function getSpeciesBySlug(slug: string): Promise<Species | null> {
  // Slugs are only lowercase letters, numbers and hyphens, so anything else
  // can't be a species and doesn't go to the database
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("species_public")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (!error) {
        return data ? speciesFromRow(data) : null;
      }
    } catch {
      // Fallback to mock data
    }
  }

  const found = mockSpecies.find((s) => s.slug === slug);
  return found || null;
}

/**
 * Retrieves published field records for a specific species.
 */
export async function getPublishedRecordsForSpecies(
  slug: string
): Promise<PlantRecord[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("records_public")
        .select("*")
        .eq("species_slug", slug)
        .eq("status", "published")
        .order("recorded_at", { ascending: false });

      if (!error && data) {
        return data.map(mapRowToRecord);
      }
    } catch {
      // Fallback to mock data
    }
  }

  return mockRecords.filter(
    (r) => r.speciesSlug === slug && r.status === "published"
  );
}

import { publicClient } from "./supabase";
import { species as mockSpecies, type Species } from "@/data/species";
import { parkTime } from "@/lib/format";
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
    // The day it changed in park time, not UTC
    updated: row.updated_at
      ? parkTime(String(row.updated_at)).slice(0, 10)
      : String(row.updated || "2026-10-02"),
  };
}

/**
 * Every species, in order of scientific name. Uses the sample data when
 * Supabase isn't set up. With Supabase set up, a failed query throws so the
 * page shows its error screen instead of sample data.
 */
export async function getSpeciesList(): Promise<Species[]> {
  const client = await publicClient();
  if (!client) return mockSpecies;

  const { data, error } = await client
    .from("species_public")
    .select("*")
    .order("scientific_name", { ascending: true });
  if (error) throw new Error(`Couldn't load the species list: ${error.message}`);
  return data.map(speciesFromRow);
}

/** One species by its URL slug, or null */
export async function getSpeciesBySlug(slug: string): Promise<Species | null> {
  // Slugs are only lowercase letters, numbers and hyphens, so anything else
  // can't be a species and doesn't go to the database
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  const client = await publicClient();
  if (!client) return mockSpecies.find((s) => s.slug === slug) ?? null;

  const { data, error } = await client
    .from("species_public")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the species ${slug}: ${error.message}`);
  return data ? speciesFromRow(data) : null;
}

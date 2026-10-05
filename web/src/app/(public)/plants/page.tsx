import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { publishedForSpecies } from "@/data/records";
import { hidesLocation, species } from "@/data/species";
import { IUCN } from "@/lib/iucn";
import { PlantSearch, type PlantSummary } from "./plant-search";

export const metadata: Metadata = {
  title: "Plants",
  description: "Search the plant species recorded at Niah National Park.",
};

export default async function PlantsPage({
  searchParams,
}: PageProps<"/plants">) {
  const { q } = await searchParams;
  const initialQuery = (Array.isArray(q) ? q[0] : q) ?? "";

  // Only what the list needs goes to the browser. No records, no coordinates.
  const plants: PlantSummary[] = species.map((s) => ({
    slug: s.slug,
    name: s.commonNames[0],
    otherNames: s.commonNames.slice(1),
    scientificName: s.scientificName,
    newerName: s.newerName ?? null,
    family: s.family,
    iucn: s.iucn,
    threatened: IUCN[s.iucn].threatened,
    sarawakProtected: s.sarawakProtected,
    hidesLocation: hidesLocation(s),
    tagged: publishedForSpecies(s.slug).length,
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Species list"
        title="Plants"
        description="Every species our field teams have recorded at Niah so far. Search by common name, Latin name or family."
      />
      <PlantSearch
        key={initialQuery}
        plants={plants}
        initialQuery={initialQuery}
      />
    </div>
  );
}

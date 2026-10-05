import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { species } from "@/data/species";
import { NewSpeciesForm } from "./new-species-form";

export const metadata: Metadata = { title: "Add a species" };

export default function NewSpeciesPage() {
  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link
          href="/dashboard/species"
          className="inline-flex min-h-11 items-center gap-1.5 font-bold text-moss hover:text-ink"
        >
          <Icon name="arrow-left" className="size-4" />
          Species
        </Link>
      </nav>
      <PageHeader
        eyebrow="Plant database"
        title="Add a species"
        description="Once it’s saved, field teams can pick it in the mobile app and it gets its own page on the public site. Check the IUCN status on the Red List before you add it."
      />
      <NewSpeciesForm
        existingNames={species.map((s) => s.scientificName)}
      />
    </div>
  );
}

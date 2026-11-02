import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";
import { SpeciesForm } from "../species-form";

export const metadata: Metadata = { title: "Add a species" };

export default async function NewSpeciesPage() {
  if (!(await requireStaff())) return null;

  // The names already in the database, so the form can say straight away if a
  // species is there. If they don't load, the database still turns down a
  // species that's already there when it saves.
  const supabase = await createClient();
  const { data } = await readAll((from, to) =>
    supabase
      .from("species_staff")
      .select("scientific_name", { count: "exact" })
      .order("id")
      .range(from, to),
  );
  const existingNames = (data ?? []).map((row) => String(row.scientific_name));

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
        description="Once it’s saved it gets its own page on the public site. Field teams can pick it in the mobile app once the phone downloads the species list. Check the IUCN status on the Red List before you add it."
      />
      <SpeciesForm mode="add" existingNames={existingNames} />
    </div>
  );
}

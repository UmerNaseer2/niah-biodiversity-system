import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import { speciesFromRow } from "@/lib/species-db";
import { valuesFromSpecies } from "@/lib/species-form";
import { mainPhoto } from "@/lib/species-photos";
import { createClient } from "@/lib/supabase/server";
import { SpeciesForm } from "../../species-form";
import { PhotoManager } from "./photo-manager";

export const metadata: Metadata = { title: "Edit a species" };

export default async function EditSpeciesPage({
  params,
}: PageProps<"/dashboard/species/[slug]/edit">) {
  if (!(await requireStaff())) return null;

  // Slugs are only lowercase letters, numbers and hyphens, so anything else
  // can't be a species and doesn't go to the database
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) notFound();

  // species_staff only answers officers and admins (supabase/007)
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("species_staff")
    .select("*")
    .eq("id", slug)
    .maybeSingle();

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <Link
        href="/dashboard/species"
        className="inline-flex min-h-11 items-center gap-1.5 font-bold text-moss hover:text-ink"
      >
        <Icon name="arrow-left" className="size-4" />
        Species
      </Link>
    </nav>
  );

  if (error) {
    console.error("Loading the species to edit failed:", error.message);
    return (
      <div>
        {breadcrumb}
        <PageHeader eyebrow="Plant database" title="Edit a species" />
        <p
          role="alert"
          className="mt-8 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          The species didn’t load. Refresh the page, and if it keeps happening,
          ask an administrator to check the database is up to date
          (supabase/README.md).
        </p>
      </div>
    );
  }
  if (!data) notFound();

  const species = speciesFromRow(data);
  // The about column on its own. Species falls back to the description when
  // it's empty, and saving shouldn't copy that across.
  const about = typeof data.about === "string" ? data.about : "";
  const name = species.commonNames[0] ?? species.scientificName;

  return (
    <div>
      {breadcrumb}
      <PageHeader
        eyebrow="Plant database"
        title={`Edit ${name}`}
        description="Changes show on the public site as soon as you save. Field teams get them in the mobile app once the phone downloads the species list, which comes with item 10 in Sprint 2. If the IUCN status is changing, check it on the Red List first."
      />
      <SpeciesForm
        mode="edit"
        slug={slug}
        initial={valuesFromSpecies(species, about)}
        photo={mainPhoto(species.photos)?.smallSrc ?? null}
        version={String(data.updated_at ?? "")}
      />
      <PhotoManager slug={slug} name={name} photos={species.photos} />
    </div>
  );
}

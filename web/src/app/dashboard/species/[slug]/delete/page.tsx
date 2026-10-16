import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { LatinName } from "@/components/plant-bits";
import { requireStaff } from "@/lib/auth";
import { plural } from "@/lib/format";
import { speciesFromRow } from "@/lib/species-db";
import { createClient } from "@/lib/supabase/server";
import { DeleteSpeciesForm } from "./delete-species-form";

export const metadata: Metadata = { title: "Delete a species" };

export default async function DeleteSpeciesPage({
  params,
}: PageProps<"/dashboard/species/[slug]/delete">) {
  if (!(await requireStaff())) return null;

  // Slugs are only lowercase letters, numbers and hyphens, so anything else
  // can't be a species and doesn't go to the database
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) notFound();

  // Both views only answer officers and admins (supabase/006 and 007)
  const supabase = await createClient();
  const [speciesResult, recordsResult] = await Promise.all([
    supabase.from("species_staff").select("*").eq("id", slug).maybeSingle(),
    supabase.from("records_staff").select("status").eq("species_slug", slug),
  ]);

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

  if (speciesResult.error || recordsResult.error) {
    console.error(
      "Loading the species to delete failed:",
      speciesResult.error?.message ?? recordsResult.error?.message,
    );
    return (
      <div>
        {breadcrumb}
        <PageHeader eyebrow="Plant database" title="Delete a species" />
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
  if (!speciesResult.data) notFound();

  const species = speciesFromRow(speciesResult.data);
  const name = species.commonNames[0] ?? species.scientificName;
  const records = recordsResult.data.length;
  const published = recordsResult.data.filter((r) => r.status === "published").length;

  return (
    <div>
      {breadcrumb}
      <PageHeader eyebrow="Plant database" title={`Delete ${name}?`} />
      <section
        aria-labelledby="what-happens"
        className="card mt-8 max-w-2xl p-5 sm:p-6"
      >
        <h2 id="what-happens" className="text-xl font-bold tracking-tight">
          What happens when you delete it
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            {name} (<LatinName name={species.scientificName} />) leaves the
            database, and its page on the public site goes with it.
          </li>
          {records === 0 ? (
            <li>It doesn’t have any plant records, so nothing else changes.</li>
          ) : (
            <li>
              It has {plural(records, "plant record")}
              {published > 0 && <>, and {published} of them show on the public site</>}
              . They stay, with the species name saved on them, but lose the
              link to this species. The public site then only shows the 440 m
              grid square they’re in, never the exact spot.
            </li>
          )}
          <li>
            You can’t undo it. Adding the species again later doesn’t link its
            old records to it.
          </li>
        </ul>
        <DeleteSpeciesForm slug={slug} />
      </section>
    </div>
  );
}

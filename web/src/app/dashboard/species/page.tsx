import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { IucnChip, LatinName } from "@/components/plant-bits";
import { hidesLocation } from "@/data/species";
import { requireStaff } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { speciesFromRow } from "@/lib/species-db";
import { SCIENTIFIC_NAME } from "@/lib/species-form";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Species" };

export default async function SpeciesPage({
  searchParams,
}: PageProps<"/dashboard/species">) {
  if (!(await requireStaff())) return null;
  const { deleted } = await searchParams;

  // Both views only answer officers and admins (supabase/006 and 007)
  const supabase = await createClient();
  const [speciesResult, recordsResult] = await Promise.all([
    readAll((from, to) =>
      supabase.from("species_staff").select("*", { count: "exact" }).order("id").range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("records_staff")
        .select("species_slug, status", { count: "exact" })
        .order("id")
        .range(from, to),
    ),
  ]);

  const header = (
    <PageHeader
      eyebrow="Plant database"
      title="Species"
      description="Every species in the database has its own page on the public site. A plant only shows its exact spot there if its species is Least Concern or Near Threatened, isn’t protected in Sarawak and isn’t set to rough area only."
      aside={
        <Link href="/dashboard/species/new" className="btn btn-primary">
          <Icon name="plus" className="size-4" />
          Add a species
        </Link>
      }
    />
  );

  if (speciesResult.error || recordsResult.error) {
    console.error(
      "Loading the species list failed:",
      speciesResult.error?.message ?? recordsResult.error?.message,
    );
    return (
      <div>
        {header}
        <p
          role="alert"
          className="mt-8 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          The species list didn’t load. Refresh the page, and if it keeps
          happening, ask an administrator to check the database is up to date
          (supabase/README.md).
        </p>
      </div>
    );
  }

  // How many records each species has, by status
  const counts = new Map<string, { published: number; waiting: number }>();
  for (const record of recordsResult.data) {
    if (typeof record.species_slug !== "string") continue;
    const count = counts.get(record.species_slug) ?? { published: 0, waiting: 0 };
    if (record.status === "published") count.published += 1;
    if (record.status === "waiting") count.waiting += 1;
    counts.set(record.species_slug, count);
  }

  const rows = speciesResult.data
    .map(speciesFromRow)
    .map((s) => ({
      ...s,
      name: s.commonNames[0] ?? s.scientificName,
      hidden: hidesLocation(s),
      published: counts.get(s.slug)?.published ?? 0,
      waiting: counts.get(s.slug)?.waiting ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Deleting a species sends the officer here with its name (actions.ts). Only
  // a scientific name that isn't in the list shows, so a made up link can't
  // put other text on the page.
  const deletedName =
    typeof deleted === "string" &&
    SCIENTIFIC_NAME.test(deleted) &&
    !rows.some((row) => row.scientificName === deleted)
      ? deleted
      : null;

  return (
    <div>
      {header}

      {deletedName && (
        <p
          role="status"
          className="mt-8 flex max-w-2xl items-start gap-2.5 rounded-xl border border-line bg-sheet p-4"
        >
          <Icon name="check" className="mt-0.5 size-4 shrink-0 text-ok" />
          <span>
            <LatinName name={deletedName} /> was deleted. Its records stay, with
            the species name saved on them.
          </span>
        </p>
      )}

      <div
        role="region"
        aria-labelledby="species-table-caption"
        tabIndex={0}
        className={`relative ${deletedName ? "mt-4" : "mt-8"} overflow-x-auto rounded-xl border border-line bg-sheet`}
      >
        <table className="w-full min-w-[56rem] text-left text-sm">
          <caption id="species-table-caption" className="sr-only">
            {rows.length} species in the database
          </caption>
          <thead className="border-b border-line bg-paper/60 text-moss">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-bold">Species</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Family</th>
              <th scope="col" className="px-4 py-2.5 font-bold">IUCN status</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Public map</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Tagged</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Updated</th>
              <th scope="col" className="px-4 py-2.5 font-bold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-moss">
                  There aren’t any species in the database yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.slug}>
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <Link
                    href={`/plants/${row.slug}`}
                    className="font-bold underline decoration-line underline-offset-4 hover:decoration-ink"
                  >
                    {row.name}
                  </Link>
                  <span className="block">
                    <LatinName name={row.scientificName} />
                  </span>
                </th>
                <td className="px-4 py-3">{row.family}</td>
                <td className="px-4 py-3">
                  <IucnChip code={row.iucn} />
                  {row.sarawakProtected && (
                    <span className="mt-1 block text-xs font-bold text-forest-deep">
                      Protected in Sarawak
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.hidden ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-moss">
                      <Icon name="lock" className="size-4" />
                      Rough area
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <Icon name="map-pin" className="size-4" />
                      Exact spot
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {row.published} public
                  {row.waiting > 0 && (
                    <span className="block text-xs font-bold text-warn">
                      {row.waiting} waiting
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDate(row.updated)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link
                      href={`/dashboard/species/${row.slug}/edit`}
                      className="btn btn-secondary"
                    >
                      Edit
                      <span className="sr-only"> {row.name}</span>
                    </Link>
                    <Link
                      href={`/dashboard/species/${row.slug}/delete`}
                      className="btn btn-danger"
                    >
                      Delete
                      <span className="sr-only"> {row.name}</span>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

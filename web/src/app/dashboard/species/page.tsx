import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { IucnChip, LatinName } from "@/components/plant-bits";
import { PlannedTape } from "@/components/tape";
import { records } from "@/data/records";
import { hidesLocation, species } from "@/data/species";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Species" };

export default function SpeciesPage() {
  const rows = [...species]
    .sort((a, b) => a.commonNames[0].localeCompare(b.commonNames[0]))
    .map((s) => {
      const tagged = records.filter((r) => r.speciesSlug === s.slug);
      return {
        ...s,
        hidden: hidesLocation(s),
        published: tagged.filter((r) => r.status === "published").length,
        waiting: tagged.filter((r) => r.status === "waiting").length,
      };
    });

  return (
    <div>
      <PageHeader
        eyebrow="Plant database"
        title="Species"
        description="The species field teams pick from when they record a plant. The IUCN status and the Sarawak protected list decide whether the public site shows exact spots or only a rough area."
        aside={
          <Link href="/dashboard/species/new" className="btn btn-primary">
            <Icon name="plus" className="size-4" />
            Add a species
          </Link>
        }
      />

      <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-moss">
        <PlannedTape items={[17]} />
        <p>Edit and delete are planned for Sprint 2, so those buttons are off.</p>
      </div>

      <div
        role="region"
        aria-labelledby="species-table-caption"
        tabIndex={0}
        className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-sheet"
      >
        <table className="w-full min-w-[56rem] text-left text-sm">
          <caption id="species-table-caption" className="sr-only">
            {species.length} species in the database
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
            {rows.map((row) => (
              <tr key={row.slug}>
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <Link
                    href={`/plants/${row.slug}`}
                    className="font-bold underline decoration-line underline-offset-4 hover:decoration-ink"
                  >
                    {row.commonNames[0]}
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
                    <button type="button" disabled className="btn btn-secondary">
                      Edit
                      <span className="sr-only"> {row.commonNames[0]}</span>
                    </button>
                    <button type="button" disabled className="btn btn-danger">
                      Delete
                      <span className="sr-only"> {row.commonNames[0]}</span>
                    </button>
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

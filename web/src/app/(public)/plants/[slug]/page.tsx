import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import {
  ConditionBadge,
  HiddenLocationBadge,
  IucnChip,
  IucnScale,
  LatinName,
  PhotoPlaceholder,
  ProtectedBadge,
} from "@/components/plant-bits";
import { PhotoGallery } from "@/components/photo-gallery";
import { ParkMap } from "@/components/park-map";
import { hidesLocation } from "@/data/species";
import { formatDate, plural } from "@/lib/format";
import { roughAreas } from "@/lib/geo";
import { IUCN } from "@/lib/iucn";
import { getPublishedRecordsForSpecies } from "@/lib/records-db";
import { getSpeciesBySlug } from "@/lib/species-db";

export async function generateMetadata({
  params,
}: PageProps<"/plants/[slug]">): Promise<Metadata> {
  const plant = await getSpeciesBySlug((await params).slug);
  if (!plant) return {};
  return { title: plant.commonNames[0], description: plant.summary };
}

function LabelRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2.5">
      <dt className="text-moss">{term}</dt>
      <dd className="font-bold">{children}</dd>
    </div>
  );
}

export default async function PlantPage({
  params,
}: PageProps<"/plants/[slug]">) {
  const plant = await getSpeciesBySlug((await params).slug);
  if (!plant) notFound();

  const name = plant.commonNames[0];
  const otherNames = plant.commonNames.slice(1);
  const hidden = hidesLocation(plant);
  const tagged = await getPublishedRecordsForSpecies(plant.slug);

  // For a hidden species records_public (and the sample data) only gives the
  // middle of each grid square, and the map only gets the squares.
  const located = tagged.flatMap((r) =>
    r.gps ? [{ id: r.tagCode, lat: r.gps.lat, lng: r.gps.lng }] : [],
  );
  const areas = hidden ? roughAreas(located) : [];

  // A species added on the website has no habitat or uses yet (the form
  // doesn't ask for them), so a section with nothing in it is left out.
  const sections = [
    { id: "about", title: "About", text: plant.about },
    { id: "habitat", title: "Where it grows", text: plant.habitat },
    { id: "uses", title: "How people use it", text: plant.uses },
  ].filter((section) => section.text.trim());

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-moss">
          <li>
            <Link href="/plants" className="font-bold hover:text-ink hover:underline">
              Plants
            </Link>
          </li>
          <li aria-hidden="true">
            <Icon name="chevron-right" className="size-4" />
          </li>
          <li aria-current="page">{name}</li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <header className="lg:col-start-1">
          <p className="eyebrow">{plant.family}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            {name}
          </h1>
          <p className="mt-1 text-xl sm:text-2xl">
            <LatinName name={plant.scientificName} authority={plant.authority} />
          </p>
          {otherNames.length > 0 && (
            <p className="mt-2 text-moss">Also called {otherNames.join(", ")}</p>
          )}
          {plant.newerName && (
            <p className="mt-1 text-sm text-moss">
              Newer sources put it in a different genus, as{" "}
              <LatinName name={plant.newerName} />.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <IucnChip code={plant.iucn} />
            {plant.sarawakProtected && <ProtectedBadge />}
            {hidden && <HiddenLocationBadge />}
          </div>
          <p className="mt-5 max-w-2xl text-lg">{plant.summary}</p>
        </header>

        <aside
          aria-labelledby="label-heading"
          className="self-start lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-paper/60 px-4 py-2.5">
              <h2 id="label-heading" className="eyebrow">
                Specimen label
              </h2>
              <Icon name="leaf" className="size-4 text-moss" />
            </div>
            <dl className="divide-y divide-line px-4 text-sm">
              <LabelRow term="Family">{plant.family}</LabelRow>
              <LabelRow term="Species">
                <LatinName
                  name={plant.scientificName}
                  authority={plant.authority}
                  className="font-normal"
                />
              </LabelRow>
              <LabelRow term="Local names">
                {plant.commonNames.join(", ")}
              </LabelRow>
              <LabelRow term="IUCN">
                {IUCN[plant.iucn].label} ({plant.iucn})
              </LabelRow>
              {plant.sarawakProtected && (
                <LabelRow term="Sarawak">Protected plant</LabelRow>
              )}
              <LabelRow term="Public map">
                {hidden ? "Rough area only" : "Exact point"}
              </LabelRow>
              <LabelRow term="Tagged">
                {plural(tagged.length, "plant")} public
              </LabelRow>
              <LabelRow term="Updated">{formatDate(plant.updated)}</LabelRow>
            </dl>
          </div>
        </aside>

        <div className="space-y-12 lg:col-start-1">
          <section aria-labelledby="photos-heading">
            <h2 id="photos-heading" className="sr-only">
              Photos
            </h2>
            {plant.photos.length > 0 ? (
              <PhotoGallery photos={plant.photos} name={name} />
            ) : (
              <div className="card flex items-center gap-4 p-4">
                <PhotoPlaceholder className="size-16 shrink-0" />
                <p className="text-moss">No photos of {name} yet.</p>
              </div>
            )}
          </section>

          {sections.length > 0 && (
            <div className="max-w-2xl space-y-8">
              {sections.map((section) => (
                <section key={section.id} aria-labelledby={`${section.id}-heading`}>
                  <h2
                    id={`${section.id}-heading`}
                    className="text-xl font-bold tracking-tight"
                  >
                    {section.title}
                  </h2>
                  <p className="mt-2">{section.text}</p>
                </section>
              ))}
            </div>
          )}

          <section aria-labelledby="status-heading">
            <h2 id="status-heading" className="text-xl font-bold tracking-tight">
              Conservation status
            </h2>
            <div className="card mt-4 p-5 sm:p-6">
              <IucnScale code={plant.iucn} />
            </div>
            {plant.sarawakProtected && (
              <p className="mt-4 max-w-2xl text-moss">
                It’s also listed as a protected plant in Sarawak, under the
                Wild Life Protection Ordinance 1998.
              </p>
            )}
          </section>

          <section aria-labelledby="tagged-heading">
            <h2 id="tagged-heading" className="text-xl font-bold tracking-tight">
              Tagged in the park
            </h2>
            {tagged.length === 0 ? (
              <p className="mt-2 max-w-2xl text-moss">
                No tagged plants of this species are public yet. New records
                only show up here after a conservation officer approves them.
              </p>
            ) : (
              <>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {tagged.map((record) => {
                    const code = record.tagCode;
                    return (
                      <li key={record.id}>
                        <Link
                          href={`/tag/${code}`}
                          className="card group flex items-center justify-between gap-4 p-4 transition-colors hover:border-pencil"
                        >
                          <div>
                            <p className="font-mono font-bold group-hover:underline">
                              {code}
                            </p>
                            <p className="mt-0.5 text-sm text-moss">
                              {record.heightM == null
                                ? "Height not measured"
                                : `${record.heightM} m tall`}{" "}
                              · recorded {formatDate(record.recordedAt)}
                            </p>
                            <div className="mt-2">
                              <ConditionBadge condition={record.condition} />
                            </div>
                          </div>
                          <Icon name="chevron-right" className="size-5 text-moss" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                {hidden && (
                  <p className="mt-6 flex max-w-2xl gap-3 text-moss">
                    <Icon name="lock" className="mt-0.5 size-5" />
                    <span>
                      Exact spots of threatened and protected plants stay with
                      park staff, so this site can’t be used to find and take
                      them. The map only shows the rough area.
                    </span>
                  </p>
                )}

                {located.length === 0 ? (
                  <p className="mt-6 max-w-2xl text-moss">
                    {tagged.length === 1
                      ? "The tagged plant doesn’t have a GPS point yet, so there’s nothing to show on a map."
                      : "The tagged plants don’t have GPS points yet, so there’s nothing to show on a map."}
                  </p>
                ) : (
                  <ParkMap
                    id="species-map"
                    title={`Map of where ${name} has been tagged`}
                    description={
                      !hidden
                        ? `A map of the park around park HQ with a dot for each tagged ${name}. Each dot is a link to its tag page.`
                        : areas.length === 1
                          ? `A map of the park around park HQ. The shaded square marks the rough area, about 440 m across, that holds the tagged ${name}. The exact spot is not shown.`
                          : `A map of the park around park HQ. The shaded squares mark the rough areas, each about 440 m across, that hold the tagged ${name}. The exact spots are not shown.`
                    }
                    areas={areas}
                    points={
                      hidden
                        ? []
                        : located.map((p) => ({
                            ...p,
                            label: p.id,
                            link: { href: `/tag/${p.id}`, text: `Tag ${p.id}` },
                          }))
                    }
                    className="mt-8"
                  />
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

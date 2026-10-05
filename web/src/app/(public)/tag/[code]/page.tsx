import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import {
  ConditionBadge,
  HiddenLocationBadge,
  IucnChip,
  LatinName,
  PhotoPlaceholder,
  ProtectedBadge,
} from "@/components/plant-bits";
import { SketchMap } from "@/components/sketch-map";
import { Planned } from "@/components/tape";
import { TreeTag } from "@/components/tree-tag";
import { findPublishedByTag, publishedRecords } from "@/data/records";
import { getSpecies, hidesLocation } from "@/data/species";
import { formatDate, plural } from "@/lib/format";
import { fromHq } from "@/lib/geo";
import { normaliseTag, safeDecode, tagCode } from "@/lib/tags";

export function generateStaticParams() {
  return publishedRecords.map((r) => ({ code: tagCode(r.id) }));
}

async function lookUp(params: PageProps<"/tag/[code]">["params"]) {
  const raw = safeDecode((await params).code);
  const code = normaliseTag(raw);
  // Waiting records are never found here, only published ones
  const record = code ? findPublishedByTag(code) : undefined;
  const plant = record ? getSpecies(record.speciesSlug) : undefined;
  return { raw, code, record, plant };
}

export async function generateMetadata({
  params,
}: PageProps<"/tag/[code]">): Promise<Metadata> {
  const { code, plant } = await lookUp(params);
  if (!code || !plant) return { title: "Tag not found" };
  return {
    title: `${plant.commonNames[0]} (${code})`,
    description: plant.summary,
  };
}

export default async function TagResultPage({
  params,
}: PageProps<"/tag/[code]">) {
  const { raw, code, record, plant } = await lookUp(params);
  if (!code) notFound();
  // "nnp-3f2a9c" or "3F2A9C" both end up on /tag/NNP-3F2A9C
  if (code !== raw) redirect(`/tag/${code}`);
  if (!record || !plant) notFound();

  const name = plant.commonNames[0];
  const hidden = hidesLocation(plant);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-moss">
          <li>
            <Link href="/tag" className="font-bold hover:text-ink hover:underline">
              Scan a tag
            </Link>
          </li>
          <li aria-hidden="true">
            <Icon name="chevron-right" className="size-4" />
          </li>
          <li aria-current="page" className="font-mono">
            {code}
          </li>
        </ol>
      </nav>

      <header className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-start">
        <div aria-hidden="true" className="shrink-0 self-center sm:self-start">
          <TreeTag code={code} swing />
        </div>
        <div>
          <p className="eyebrow">You scanned tag {code}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            {name}
          </h1>
          <p className="mt-1 text-xl">
            <LatinName name={plant.scientificName} />
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <IucnChip code={plant.iucn} />
            {plant.sarawakProtected && <ProtectedBadge />}
            {hidden && <HiddenLocationBadge />}
          </div>
          <p className="mt-5 text-lg">{plant.summary}</p>
          <Link
            href={`/plants/${plant.slug}`}
            className="mt-4 inline-flex items-center gap-1.5 font-bold text-forest hover:underline"
          >
            More about this species
            <Icon name="arrow-right" className="size-4" />
          </Link>
        </div>
      </header>

      <section aria-labelledby="facts-heading" className="mt-12">
        <h2 id="facts-heading" className="text-xl font-bold tracking-tight">
          This plant
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <div className="bg-sheet p-4">
            <dt className="text-sm text-moss">Height</dt>
            <dd className="mt-1 text-lg font-bold">{record.heightM} m</dd>
          </div>
          <div className="bg-sheet p-4">
            <dt className="text-sm text-moss">Condition</dt>
            <dd className="mt-1.5">
              <ConditionBadge condition={record.condition} />
            </dd>
          </div>
          <div className="bg-sheet p-4">
            <dt className="text-sm text-moss">Recorded</dt>
            <dd className="mt-1 text-lg font-bold">
              {formatDate(record.recordedAt)}
            </dd>
          </div>
          <div className="bg-sheet p-4">
            <dt className="text-sm text-moss">Photos</dt>
            <dd className="mt-1 text-lg font-bold">
              {record.photoCount > 0
                ? plural(record.photoCount, "photo")
                : "None yet"}
            </dd>
          </div>
        </dl>
      </section>

      {record.photoCount > 0 && (
        <Planned items={[18]} title="Photos of this plant" className="mt-10">
          <p>
            The ranger took {plural(record.photoCount, "photo")}. They’ll show
            here once the gallery is built.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {Array.from({ length: record.photoCount }, (_, i) => (
              <PhotoPlaceholder key={i} className="aspect-square" />
            ))}
          </div>
        </Planned>
      )}

      <section aria-labelledby="where-heading" className="mt-12">
        <h2 id="where-heading" className="text-xl font-bold tracking-tight">
          Where it is
        </h2>
        {hidden ? (
          <div className="card mt-4 flex gap-4 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-moss">
              <Icon name="lock" />
            </span>
            <div>
              <p className="font-bold">The exact spot is hidden</p>
              <p className="mt-1 text-moss">
                Exact spots of threatened and protected plants stay with park
                staff, so this site can’t be used to find and take them.
              </p>
              <Link
                href={`/plants/${plant.slug}`}
                className="mt-3 inline-block font-bold text-forest hover:underline"
              >
                See the rough area on the species page
              </Link>
            </div>
          </div>
        ) : record.gps ? (
          <>
            <p className="mt-2 text-moss">
              It’s {fromHq(record.gps.lat, record.gps.lng)}.
            </p>
            <SketchMap
              id="tag-map"
              title={`Sketch map showing tag ${code}`}
              description={`A sketch map around park HQ. The dot is tag ${code}, ${fromHq(record.gps.lat, record.gps.lng)}.`}
              points={[
                {
                  id: code,
                  lat: record.gps.lat,
                  lng: record.gps.lng,
                  label: code,
                },
              ]}
              planned={[20]}
              className="mt-8"
            />
          </>
        ) : (
          <p className="mt-2 text-moss">
            This plant doesn’t have a GPS point yet.
          </p>
        )}
      </section>
    </div>
  );
}

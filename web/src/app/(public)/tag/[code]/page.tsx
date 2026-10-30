import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import {
  ConditionBadge,
  HiddenLocationBadge,
  IucnChip,
  LatinName,
  ProtectedBadge,
} from "@/components/plant-bits";
import { MainPhoto } from "@/components/photo-gallery";
import { ParkMap } from "@/components/park-map";
import { TreeTag } from "@/components/tree-tag";
import { hidesLocation, type Species } from "@/data/species";
import { formatDate, plural } from "@/lib/format";
import { fromHq, roughAreas } from "@/lib/geo";
import { getPublishedByTag, type PublicRecord } from "@/lib/records-db";
import { getSpeciesBySlug } from "@/lib/species-db";
import { normaliseTag, safeDecode } from "@/lib/tags";

const NO_SPECIES =
  "The field team hasn’t matched this plant to a species on our list yet.";

async function lookUp(params: PageProps<"/tag/[code]">["params"]) {
  const raw = safeDecode((await params).code);
  const code = normaliseTag(raw);
  // The page sends any other spelling to the tidy code first, so only that
  // one gets looked up. Waiting records are never found, only approved ones.
  if (!code || code !== raw) return { raw, code, record: null, species: null };
  const record = await getPublishedByTag(code);
  const species = record?.speciesSlug
    ? await getSpeciesBySlug(record.speciesSlug)
    : null;
  return { raw, code, record, species };
}

// The species' common name, or what the field team wrote down if the plant
// isn't matched to a species yet
function plantName(record: PublicRecord, species: Species | null) {
  return species?.commonNames[0] ?? record.commonName ?? record.speciesName;
}

export async function generateMetadata({
  params,
}: PageProps<"/tag/[code]">): Promise<Metadata> {
  const { code, record, species } = await lookUp(params);
  if (!code || !record) return { title: "Tag not found" };
  return {
    title: `${plantName(record, species)} (${code})`,
    description: species ? species.summary : NO_SPECIES,
  };
}

export default async function TagResultPage({
  params,
}: PageProps<"/tag/[code]">) {
  const { raw, code, record, species } = await lookUp(params);
  if (!code) notFound();
  // "nnp-3f2a9c" or "3F2A9C" both end up on /tag/NNP-3F2A9C
  if (code !== raw) redirect(`/tag/${code}`);
  if (!record) notFound();

  const name = plantName(record, species);
  // Same rule as records_public, which also hides the spot of a plant with no
  // species yet
  const hidden = !species || hidesLocation(species);
  const speciesPhotos = species?.photos ?? [];

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
          {species ? (
            <p className="mt-1 text-xl">
              <LatinName name={species.scientificName} />
            </p>
          ) : (
            record.speciesName !== name && (
              <p className="mt-1 text-xl">{record.speciesName}</p>
            )
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {species && <IucnChip code={species.iucn} />}
            {species?.sarawakProtected && <ProtectedBadge />}
            {hidden && <HiddenLocationBadge />}
          </div>
          <p className="mt-5 text-lg">{species ? species.summary : NO_SPECIES}</p>
          {species && (
            <Link
              href={`/plants/${species.slug}`}
              className="mt-4 inline-flex items-center gap-1.5 font-bold text-forest hover:underline"
            >
              More about this species
              <Icon name="arrow-right" className="size-4" />
            </Link>
          )}
        </div>
      </header>

      <section aria-labelledby="facts-heading" className="mt-12">
        <h2 id="facts-heading" className="text-xl font-bold tracking-tight">
          This plant
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <div className="bg-sheet p-4">
            <dt className="text-sm text-moss">Height</dt>
            <dd className="mt-1 text-lg font-bold">
              {record.heightM == null ? "Not measured" : `${record.heightM} m`}
            </dd>
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

      {(speciesPhotos.length > 0 || record.photoCount > 0) && (
        <section aria-labelledby="photos-heading" className="mt-12">
          <h2 id="photos-heading" className="text-xl font-bold tracking-tight">
            Photos
          </h2>
          {speciesPhotos.length > 0 && (
            <>
              <p className="mt-2 text-moss">
                What {name} looks like. This photo is of the species, not this
                exact plant.
              </p>
              <MainPhoto photos={speciesPhotos} name={name} className="mt-4 max-w-md" />
            </>
          )}
          {record.photoCount > 0 && (
            <div className="card mt-4 flex max-w-2xl gap-4 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-moss">
                <Icon name="lock" />
              </span>
              <p className="text-moss">
                The field team took {plural(record.photoCount, "photo")} of
                this plant. They stay with park staff for now, because a photo
                can show where a plant grows.
              </p>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="where-heading" className="mt-12">
        <h2 id="where-heading" className="text-xl font-bold tracking-tight">
          Where it is
        </h2>
        {hidden ? (
          <>
            <div className="card mt-4 flex gap-4 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-moss">
                <Icon name="lock" />
              </span>
              <div>
                <p className="font-bold">The exact spot is hidden</p>
                {species ? (
                  <>
                    <p className="mt-1 text-moss">
                      Exact spots of threatened and protected plants stay with
                      park staff, so this site can’t be used to find and take
                      them.
                    </p>
                    <Link
                      href={`/plants/${species.slug}`}
                      className="mt-3 inline-block font-bold text-forest hover:underline"
                    >
                      See the rough area on the species page
                    </Link>
                  </>
                ) : (
                  <p className="mt-1 text-moss">
                    Until we know what this plant is, its exact spot stays with
                    park staff in case it turns out to be threatened or
                    protected.
                  </p>
                )}
              </div>
            </div>
            {/* With no species there's no species page, so the rough area
                goes here. The view already moved the point to the middle of
                its grid square. */}
            {!species && record.gps && (
              <ParkMap
                id="tag-map"
                title={`Map of the rough area around tag ${code}`}
                description={`A map of the park around park HQ. The shaded square marks the rough area, about 440 m across, that holds tag ${code}. The exact spot is not shown.`}
                areas={roughAreas([record.gps])}
                className="mt-8"
              />
            )}
          </>
        ) : record.gps ? (
          <>
            <p className="mt-2 text-moss">
              It’s {fromHq(record.gps.lat, record.gps.lng)}.
            </p>
            <ParkMap
              id="tag-map"
              title={`Map showing tag ${code}`}
              description={`A map of the park around park HQ. The dot is tag ${code}, ${fromHq(record.gps.lat, record.gps.lng)}.`}
              points={[
                {
                  id: code,
                  lat: record.gps.lat,
                  lng: record.gps.lng,
                  label: code,
                },
              ]}
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

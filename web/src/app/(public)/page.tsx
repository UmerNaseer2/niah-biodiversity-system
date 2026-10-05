import Form from "next/form";
import Link from "next/link";
import { Icon } from "@/components/icon";
import {
  HiddenLocationBadge,
  IucnChip,
  LatinName,
} from "@/components/plant-bits";
import { PlannedTape } from "@/components/tape";
import { TrunkWithTag } from "@/components/tree-tag";
import { publishedRecords } from "@/data/records";
import { getSpecies, hidesLocation } from "@/data/species";
import { formatDate, itemsLabel } from "@/lib/format";
import { tagCode } from "@/lib/tags";

// The order things really happen in, so the numbers mean something
const STEPS = [
  {
    title: "A ranger tags it",
    text: "They nail a tag to the plant, scan it with our app and fill in the species, height, condition and GPS point.",
    where: "Mobile app",
    items: [5, 6, 7, 8],
  },
  {
    title: "The phone sends it in",
    text: "There’s often no signal in the forest, so records are saved on the phone and upload once it’s back.",
    where: "Mobile app",
    items: [9, 10],
  },
  {
    title: "An officer checks it",
    text: "A conservation officer looks over each new record and approves it, or sends it back with a reason.",
    where: "Staff dashboard",
    items: [19],
  },
  {
    title: "It shows up here",
    text: "Approved plants get a public page. Threatened and protected ones only show a rough area, never the exact spot.",
    where: "This website",
    items: [16],
  },
];

const HERO_TAG = "NNP-3F2A9C";

export default function HomePage() {
  const recent = [...publishedRecords]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .map((record) => {
      const plant = getSpecies(record.speciesSlug);
      if (!plant) throw new Error(`No species called ${record.speciesSlug}`);
      return { record, plant, code: tagCode(record.id) };
    });

  return (
    <>
      <section className="mx-auto grid w-full max-w-6xl items-center gap-x-16 gap-y-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:pt-14">
        <div className="max-w-xl">
          <p className="eyebrow">Niah National Park, Sarawak</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
            Look up a tagged plant
          </h1>
          <p className="mt-4 text-lg text-moss">
            Field teams at Niah nail a metal tag to every plant they record.
            Scan the QR code on a tag, or search by name, to find out what the
            plant is and why it matters.
          </p>

          <Form action="/plants" role="search" className="mt-8">
            <label htmlFor="home-search" className="font-bold">
              Search by plant name
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="home-search"
                type="search"
                name="q"
                autoComplete="off"
                placeholder="Belian, pitcher plant, Shorea…"
                className="field min-w-0 flex-1"
              />
              <button type="submit" className="btn btn-primary">
                <Icon name="search" />
                Search
              </button>
            </div>
          </Form>
          <p className="mt-4 text-moss">
            Standing next to a tag?{" "}
            <Link
              href="/tag"
              className="font-bold text-forest underline underline-offset-4 hover:no-underline"
            >
              Type its code instead
            </Link>
          </p>
        </div>

        <div>
          <TrunkWithTag
            code={HERO_TAG}
            href={`/tag/${HERO_TAG}`}
            label={`Open the page for tag ${HERO_TAG}, a belian tree`}
          />
          <p className="mx-auto mt-3 max-w-60 text-center text-sm text-moss">
            Tap the tag to see what a visitor gets after scanning it.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="recent-heading"
        className="border-y border-line bg-sheet"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h2
                id="recent-heading"
                className="text-2xl font-bold tracking-tight"
              >
                Recently tagged
              </h2>
              <p className="mt-1 text-moss">
                Plants an officer has checked and made public.
              </p>
            </div>
            <Link
              href="/plants"
              className="inline-flex items-center gap-1.5 font-bold text-forest hover:underline"
            >
              All plants
              <Icon name="arrow-right" className="size-4" />
            </Link>
          </div>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map(({ record, plant, code }) => (
              <li key={record.id}>
                <Link
                  href={`/tag/${code}`}
                  className="card group flex h-full flex-col overflow-hidden transition-colors hover:border-pencil"
                >
                  <div
                    aria-hidden="true"
                    className="hatch flex aspect-[4/3] items-center justify-center border-b border-line text-pencil"
                  >
                    <Icon name="camera" className="size-6" />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-mono text-xs font-bold text-moss">
                      {code}
                    </p>
                    <h3 className="mt-1 text-lg font-bold leading-snug group-hover:underline">
                      {plant.commonNames[0]}
                    </h3>
                    <LatinName name={plant.scientificName} className="text-moss" />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <IucnChip code={plant.iucn} />
                      {hidesLocation(plant) && <HiddenLocationBadge />}
                    </div>
                    <p className="mt-auto pt-4 text-sm text-moss">
                      Recorded {formatDate(record.recordedAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="how-heading"
        className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6"
      >
        <h2 id="how-heading" className="text-2xl font-bold tracking-tight">
          How a plant gets on this site
        </h2>
        <p className="mt-1 max-w-2xl text-moss">
          Four steps from the forest to this page. The item numbers are the
          release items from our project plan.
        </p>
        <ol className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="border-t-2 border-ink pt-4">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-ink font-mono text-sm font-bold text-paper"
              >
                {index + 1}
              </span>
              <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
              <p className="mt-1 text-moss">{step.text}</p>
              <p className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.08em] text-moss">
                {step.where} · {itemsLabel(step.items)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="card flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <PlannedTape items={[18]} className="-rotate-1" />
            <h2 className="mt-4 text-xl font-bold">Pink tape means planned</h2>
            <p className="mt-1 max-w-2xl text-moss">
              Field teams tie pink flagging tape on trees they still need to
              come back to. We use it the same way: anything taped isn’t built
              yet, and the tape says which release item and sprint it belongs
              to.
            </p>
          </div>
          <Link href="/screens" className="btn btn-secondary shrink-0">
            See every screen
            <Icon name="arrow-right" className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

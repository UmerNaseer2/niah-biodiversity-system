import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { PlannedTape } from "@/components/tape";
import { publicScreens, staffScreens, type Screen } from "@/data/screens";
import { releaseItem } from "@/lib/release";

export const metadata: Metadata = {
  title: "Every screen",
  description:
    "Every screen in the Niah Plant Records wireframe, in the order we demo them.",
};

const WORKS_NOW = [
  "Every page is clickable and links to the others.",
  "Plant search, the tag lookup, the review queue and the sensor alerts all respond as you use them.",
  "The CSV download on the reports page is built from the mock records.",
  "Threatened and protected plants only show a rough area on public pages. Their exact points never leave the server.",
];

const NOT_REAL_YET = [
  "There’s no database. Everything comes from mock files in web/src/data (item 14).",
  "There’s no real sign in, so anyone can open the dashboard (items 2 and 15).",
  "Nothing is saved. Refreshing a page puts it back how it was.",
  "Maps are hand drawn sketches. Real maps are item 20.",
  "The squares on the tags don’t scan yet (item 12).",
  "Photos are hatched boxes until photo upload is built (items 11 and 18).",
];

function ScreenList({ screens, start }: { screens: Screen[]; start: number }) {
  return (
    <ol start={start} className="mt-4 space-y-3">
      {screens.map((screen, index) => (
        <li
          key={screen.path}
          className="card flex gap-4 p-4 sm:gap-5 sm:p-5"
        >
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper font-mono text-sm font-bold text-moss"
          >
            {start + index}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h3 className="text-lg font-bold">
                <Link
                  href={screen.path}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {screen.title}
                  <Icon name="arrow-right" className="size-4 text-moss" />
                </Link>
              </h3>
              <code className="break-all font-mono text-sm text-moss">
                {screen.path}
              </code>
            </div>
            <p className="mt-1">{screen.works}</p>
            <ul aria-label="Release items" className="mt-3 flex flex-wrap gap-2">
              {screen.items.map((item) => {
                const { name, sprint } = releaseItem(item);
                return (
                  <li
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper py-0.5 pl-0.5 pr-2 text-xs"
                  >
                    <span className="rounded-[0.3rem] bg-ink px-1.5 py-px font-mono font-bold text-paper">
                      <span className="sr-only">Item </span>
                      {item}
                    </span>
                    <span className="font-bold">{name}</span>
                    <span className="text-moss">
                      <span className="sr-only">, </span>
                      {sprint}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ScreensPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Demo running order"
        title="Every screen"
        description="All the pages in this wireframe, in the order we’d walk through them. The chips under each one are its release items from our project plan."
      />

      <div className="mt-8 flex flex-col gap-3 rounded-xl border border-line bg-sheet p-4 sm:flex-row sm:items-center sm:gap-5">
        <PlannedTape items={[18]} className="-rotate-1 self-start sm:self-auto" />
        <p className="text-sm text-moss">
          Pink tape marks anything that isn’t built yet. It says which release
          item it belongs to and the sprint it’s planned for.
        </p>
      </div>

      <section aria-labelledby="public-heading" className="mt-12">
        <h2 id="public-heading" className="text-xl font-bold tracking-tight">
          Public website
        </h2>
        <p className="text-moss">
          For visitors, students and anyone who scans a tag in the park.
        </p>
        <ScreenList screens={publicScreens} start={1} />
      </section>

      <section aria-labelledby="staff-heading" className="mt-12">
        <h2 id="staff-heading" className="text-xl font-bold tracking-tight">
          Staff dashboard
        </h2>
        <p className="text-moss">
          For conservation officers, botanists, researchers and admins. In
          the demo you’re signed in as Mira Tan, a made-up officer.
        </p>
        <ScreenList screens={staffScreens} start={publicScreens.length + 1} />
      </section>

      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <section aria-labelledby="works-heading" className="card p-5 sm:p-6">
          <h2
            id="works-heading"
            className="flex items-center gap-2 text-lg font-bold"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-ok-soft text-ok">
              <Icon name="check" className="size-4" />
            </span>
            What works now
          </h2>
          <ul className="mt-4 space-y-3">
            {WORKS_NOW.map((line) => (
              <li key={line} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ok"
                />
                {line}
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="not-real-heading"
          className="card p-5 sm:p-6"
        >
          <h2
            id="not-real-heading"
            className="flex items-center gap-2 text-lg font-bold"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-paper text-moss">
              <Icon name="clock" className="size-4" />
            </span>
            What isn’t real yet
          </h2>
          <ul className="mt-4 space-y-3">
            {NOT_REAL_YET.map((line) => (
              <li key={line} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2.5 size-1.5 shrink-0 rounded-full bg-pencil"
                />
                {line}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

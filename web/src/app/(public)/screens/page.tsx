import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { publicScreens, staffScreens, type Screen } from "@/data/screens";

export const metadata: Metadata = {
  title: "Every screen",
  description: "Every screen on the Niah Plant Records website.",
};

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
        title="Every screen"
        description="All the pages on the site."
      />

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
          For conservation officers and administrators. Every page here needs
          a staff account, and anyone else who signs in sees a no access page.
        </p>
        <ScreenList screens={staffScreens} start={publicScreens.length + 1} />
      </section>
    </div>
  );
}

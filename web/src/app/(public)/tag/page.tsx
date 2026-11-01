import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { TreeTag } from "@/components/tree-tag";
import { TagLookup } from "./tag-lookup";

export const metadata: Metadata = {
  title: "Scan a tag",
  description:
    "Type the code from a plant tag at Niah National Park to see what the plant is.",
};

const EXAMPLES = [
  { code: "NNP-3F2A9C", note: "Belian, location hidden" },
  { code: "NNP-B17D03", note: "Tapang, protected in Sarawak" },
  { code: "NNP-D4B86E", note: "Not public yet, so there’s no page" },
];

export default function TagPage() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-x-14 gap-y-12 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <PageHeader
          eyebrow="Tag lookup"
          title="Scan a tag"
          description="Point your phone’s camera at the QR code on the tag and the plant’s page opens. If it won’t scan, type the code that’s stamped under it."
        />
        <TagLookup />

        <section aria-labelledby="examples-heading" className="mt-12">
          <h2 id="examples-heading" className="font-bold">
            No tag nearby? Try one of these
          </h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {EXAMPLES.map((example) => (
              <li key={example.code}>
                <Link
                  href={`/tag/${example.code}`}
                  className="group flex items-center gap-4 py-3"
                >
                  <span className="shrink-0 font-mono font-bold group-hover:underline">
                    {example.code}
                  </span>
                  <span className="text-sm text-moss">{example.note}</span>
                  <Icon
                    name="chevron-right"
                    className="ml-auto size-4 text-moss"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="self-start">
        <h2 className="font-bold">Where the tags come from</h2>
        <p className="mt-2 text-sm text-moss">
          Botanists print each tag from the plant’s record in our phone app,
          even with no signal. The QR code opens the plant’s page here once a
          conservation officer has approved the record, and the app’s Scan tab
          reads it too.
        </p>
        <div aria-hidden="true" className="mt-5 flex justify-center pb-2">
          <TreeTag code="NNP-3F2A9C" />
        </div>
      </aside>
    </div>
  );
}

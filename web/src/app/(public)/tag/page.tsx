import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TreeTag } from "@/components/tree-tag";
import { TagLookup } from "./tag-lookup";

export const metadata: Metadata = {
  title: "Scan a tag",
  description:
    "Type the code from a plant tag at Niah National Park to see what the plant is.",
};

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

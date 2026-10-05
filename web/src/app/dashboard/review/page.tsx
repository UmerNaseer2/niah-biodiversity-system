import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Planned } from "@/components/tape";
import { getPerson } from "@/data/people";
import { records } from "@/data/records";
import { getSpecies, hidesLocation } from "@/data/species";
import { formatCoords, formatDateTime } from "@/lib/format";
import { tagCode } from "@/lib/tags";
import { ReviewQueue, type QueueItem } from "./review-queue";

export const metadata: Metadata = { title: "Review queue" };

export default function ReviewPage() {
  // Oldest first, so nothing sits in the queue for too long
  const queue: QueueItem[] = records
    .filter((r) => r.status === "waiting")
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((r) => {
      const plant = getSpecies(r.speciesSlug);
      if (!plant) throw new Error(`Record points at a missing species: ${r.speciesSlug}`);
      return {
        id: r.id,
        code: tagCode(r.id),
        speciesName: plant.commonNames[0],
        scientificName: plant.scientificName,
        iucn: plant.iucn,
        hidesLocation: hidesLocation(plant),
        heightM: r.heightM,
        condition: r.condition,
        photoCount: r.photoCount,
        coords: r.gps ? formatCoords(r.gps.lat, r.gps.lng) : null,
        accuracyM: r.gps?.accuracyM ?? null,
        notes: r.notes ?? null,
        recordedBy: getPerson(r.recordedBy).name,
        recordedAt: formatDateTime(r.recordedAt),
      };
    });

  return (
    <div>
      <PageHeader
        eyebrow="Records"
        title="Review queue"
        description="New records from the mobile app wait here until an officer checks them. Approved ones go on the public site. Rejected ones go back to the ranger with your reason."
      />
      <Planned items={[19]} title="Decisions aren’t saved yet" className="mt-8">
        <p>
          Approving here doesn’t publish anything, and refreshing the page
          brings both records back. Saving decisions and letting the ranger
          know is item 19.
        </p>
      </Planned>
      <ReviewQueue items={queue} />
    </div>
  );
}

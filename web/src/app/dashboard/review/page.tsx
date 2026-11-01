import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { hidesLocation } from "@/data/species";
import { requireStaff } from "@/lib/auth";
import { formatCoords, formatDateTime } from "@/lib/format";
import type { IucnCode } from "@/lib/iucn";
import { recordFromRow, type StaffRecord } from "@/lib/records-staff";
import { commonNameIsNew, nameDisagrees } from "@/lib/review";
import { speciesFromRow } from "@/lib/species-db";
import { createClient } from "@/lib/supabase/server";
import { ReviewQueue, type ReviewItem } from "./review-queue";

export const metadata: Metadata = { title: "Review queue" };

/** How many reviewed records the page keeps under the queue, for fixing a mistake */
const RECENT = 10;

export default async function ReviewPage() {
  if (!(await requireStaff())) return null;

  // Both views only answer officers and admins (supabase/006 and 007).
  // Oldest first, so nothing sits in the queue for too long.
  const supabase = await createClient();
  const [waitingResult, decidedResult, speciesResult] = await Promise.all([
    supabase
      .from("records_staff")
      .select("*")
      .eq("status", "waiting")
      .order("recorded_at", { ascending: true }),
    supabase
      .from("records_staff")
      .select("*")
      .in("status", ["published", "rejected"])
      .not("reviewed_at", "is", null)
      .order("reviewed_at", { ascending: false })
      .limit(RECENT),
    supabase.from("species_staff").select("*"),
  ]);

  const header = (
    <PageHeader
      eyebrow="Records"
      title="Review queue"
      description="New records from the mobile app wait here until an officer checks them. Approved ones go on the public site. Rejected ones stay off it, and the ranger sees your reason on their phone after their next sync."
    />
  );

  if (waitingResult.error || decidedResult.error || speciesResult.error) {
    console.error(
      "Loading the review queue failed:",
      (waitingResult.error ?? decidedResult.error ?? speciesResult.error)?.message,
    );
    return (
      <div>
        {header}
        <p
          role="alert"
          className="mt-8 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          The review queue didn’t load. Refresh the page, and if it keeps
          happening, ask an administrator to check the database is up to date
          (supabase/README.md).
        </p>
      </div>
    );
  }

  const species = new Map(
    speciesResult.data.map(speciesFromRow).map((s) => [s.slug, s]),
  );

  function toItem(row: Record<string, unknown>): ReviewItem {
    const record: StaffRecord = recordFromRow(row);
    const plant = record.speciesSlug ? species.get(record.speciesSlug) : undefined;
    return {
      id: record.id,
      version: record.version,
      code: record.tagCode,
      speciesName: plant?.commonNames[0] ?? record.commonName ?? record.speciesName,
      scientificName: plant?.scientificName ?? record.speciesName,
      // Shown as well when they disagree, so the officer sees what was sent
      nameDisagreesWith:
        plant && nameDisagrees(record.speciesName, plant.scientificName)
          ? record.speciesName
          : null,
      newCommonName:
        plant && commonNameIsNew(record.commonName, plant.commonNames)
          ? record.commonName
          : null,
      iucn: plant ? (plant.iucn as IucnCode) : null,
      // A plant with no species yet only shows a rough area to the public
      hidesLocation: plant ? hidesLocation(plant) : true,
      heightM: record.heightM,
      condition: record.condition,
      photoCount: record.photoCount,
      coords: record.gps ? formatCoords(record.gps.lat, record.gps.lng) : null,
      accuracyM: record.gps?.accuracyM ?? null,
      notes: record.notes,
      recordedBy: record.recordedBy ?? "Unknown",
      recordedAt: formatDateTime(record.recordedAt),
      status: record.status,
      reviewNotes: record.reviewNotes,
      reviewedBy: record.reviewedBy,
      reviewedAt: record.reviewedAt ? formatDateTime(record.reviewedAt) : null,
    };
  }

  return (
    <div>
      {header}
      <ReviewQueue
        waiting={waitingResult.data.map(toItem)}
        decided={decidedResult.data.map(toItem)}
      />
    </div>
  );
}

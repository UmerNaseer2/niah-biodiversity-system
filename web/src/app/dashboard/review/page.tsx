import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { recordHidesLocation } from "@/data/species";
import { AI_CHECK_COLUMNS, aiCheckFromRow, aiCheckUnavailable } from "@/lib/ai-check";
import { requireStaff } from "@/lib/auth";
import { formatCoords, formatDateTime } from "@/lib/format";
import type { IucnCode } from "@/lib/iucn";
import { recordFromRow, type StaffRecord } from "@/lib/records-staff";
import { commonNameIsNew, nameDisagrees, sameName } from "@/lib/review";
import { ifItKeepsHappening } from "@/lib/setup-hint";
import { speciesFromRow } from "@/lib/species-db";
import { sqlIsMissing } from "@/lib/sql-missing";
import { createClient } from "@/lib/supabase/server";
import { tagCode } from "@/lib/tags";
import { ReviewQueue, type ReviewItem } from "./review-queue";

export const metadata: Metadata = { title: "Review queue" };

/** How many reviewed records the page keeps under the queue, for fixing a mistake */
const RECENT = 10;

/**
 * How many waiting records the page shows at once, oldest first. With 400 waiting the page was over
 * 2 MB (docs/test-results/item-37-performance.md), and hosted Supabase sends at most 1000 rows, so a
 * longer queue would have shown the wrong number too. The next ones come in as these are decided.
 */
const SHOWN = 50;

export default async function ReviewPage() {
  const me = await requireStaff();
  if (!me) return null;

  // Both views only answer officers and admins (supabase/006 and 007).
  // Oldest first, so nothing sits in the queue for too long.
  const supabase = await createClient();
  const [waitingResult, decidedResult, speciesResult] = await Promise.all([
    supabase
      .from("records_staff")
      .select("*", { count: "exact" })
      .eq("status", "waiting")
      .order("recorded_at", { ascending: true })
      .order("id")
      .limit(SHOWN),
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
      description="New records from the mobile app wait here until an officer checks them. Approved ones go on the public site. Rejected ones stay off it, and the person who recorded it sees your reason on their phone after their next sync."
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
          The review queue didn’t load. Refresh the page, and if it keeps happening,{" "}
          {ifItKeepsHappening(me.role)}
        </p>
      </div>
    );
  }

  const species = new Map(
    speciesResult.data.map(speciesFromRow).map((s) => [s.slug, s]),
  );

  // The AI photo check on each waiting record (supabase/032). It's only a second opinion, so if
  // it doesn't load the queue still works, and each card says the check didn't load. Without 032
  // there's nothing to show.
  const ai = await loadAiChecks(
    supabase,
    waitingResult.data.map((row) => String(row.id)),
  );

  function toItem(row: Record<string, unknown>): ReviewItem {
    const record: StaffRecord = recordFromRow(row);
    const plant = record.speciesSlug ? species.get(record.speciesSlug) : undefined;
    // With no species yet, approving links it to one with the same name, or adds it to the list
    // (supabase/031_species_from_record.sql)
    const listed = plant
      ? undefined
      : [...species.values()].find((s) => sameName(record.speciesName, s.scientificName));
    const addsSpecies = !plant && !listed && record.status === "waiting";
    return {
      id: record.id,
      version: record.version,
      code: record.tagCode,
      visitOf: record.visitOf ? { id: record.visitOf, code: tagCode(record.visitOf) } : null,
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
      listedAs: listed ? listed.scientificName : null,
      addsSpecies,
      // A new species is added as Not Evaluated, which shows the exact spot. A published plant
      // with no species (its species was taken off the list) only shows a rough area.
      hidesLocation: addsSpecies ? false : recordHidesLocation(record.speciesName, plant ?? listed),
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
      aiCheck: ai && record.status === "waiting" ? aiCheckFor(ai, record) : null,
    };
  }

  return (
    <div>
      {header}
      <ReviewQueue
        waiting={waitingResult.data.map(toItem)}
        waitingTotal={waitingResult.count ?? waitingResult.data.length}
        decided={decidedResult.data.map(toItem)}
      />
    </div>
  );
}

type LoadedAiChecks =
  | {
      rows: Map<string, Record<string, unknown>>;
      loadedAt: number;
      /** Why looking for lost checks didn't work, shown on the cards still checking */
      lostProblem: string | null;
    }
  | { failed: string };

/**
 * The AI checks for the records on the page, by record ID, and when they were loaded (to tell
 * when one has been checking for too long). Null when 032 isn't in this database, so there's
 * nothing to show. When they don't load, it says why, and each card shows that.
 *
 * First it asks the database to fail any check that got lost on the way (033), so a check whose
 * function isn't there or never answered says why instead of "Checking" for ever.
 */
async function loadAiChecks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<LoadedAiChecks | null> {
  if (ids.length === 0) return { rows: new Map(), loadedAt: Date.now(), lostProblem: null };

  let lostProblem: string | null = null;
  const lost = await supabase.rpc("fail_lost_ai_checks");
  // Without 033 the page can't look for lost ones, and the 2 minute rule below still shows them
  if (lost.error && !sqlIsMissing(lost.error)) {
    console.error("Looking for lost AI checks failed:", lost.error.code, lost.error.message);
    lostProblem =
      `The page couldn’t look for checks that got lost on the way. The database said: ` +
      `${lost.error.message}.`;
  }

  const { data, error } = await supabase
    .from("record_ai_checks")
    .select(AI_CHECK_COLUMNS)
    .in("record_id", ids);
  if (error) {
    if (sqlIsMissing(error)) return null;
    console.error("Loading the AI checks failed:", error.code, error.message);
    return {
      failed:
        `The AI checks didn’t load, so this one can’t be shown. The database said: ` +
        `${error.message}. Reload the page to try again.`,
    };
  }
  return {
    rows: new Map(
      (data as unknown as Record<string, unknown>[]).map((row) => [String(row.record_id), row]),
    ),
    loadedAt: Date.now(),
    lostProblem,
  };
}

function aiCheckFor(ai: LoadedAiChecks, record: StaffRecord) {
  if ("failed" in ai) return aiCheckUnavailable(ai.failed);
  const check = aiCheckFromRow(ai.rows.get(record.id), record, ai.loadedAt, formatDateTime);
  if (check.status === "checking" && ai.lostProblem) check.warning = ai.lostProblem;
  return check;
}

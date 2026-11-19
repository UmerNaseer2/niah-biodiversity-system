import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { EditHistory } from "@/components/edit-history";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import { ConditionBadge } from "@/components/plant-bits";
import { formatDateTime, plural } from "@/lib/format";
import { loadHistory } from "@/lib/history";
import { RECORD_ID } from "@/lib/record-form";
import { recordPhotoLinks, type RecordPhoto } from "@/lib/record-photos";
import {
  recordFromRow,
  STATUS_LABEL,
  valuesFromRecord,
  type StaffRecord,
} from "@/lib/records-staff";
import { ifItKeepsHappening } from "@/lib/setup-hint";
import { speciesOptionFromRow, type SpeciesOption } from "@/lib/species-search";
import { sqlIsMissing } from "@/lib/sql-missing";
import { createClient } from "@/lib/supabase/server";
import { tagCode } from "@/lib/tags";
import { newestVisitsFirst } from "@/lib/visits";
import { RecordForm } from "../../record-form";

export const metadata: Metadata = { title: "Edit a record" };

/** What the photos section says when there's nothing to show */
function noPhotosText(photoCount: number, photoFolder: string | null) {
  if (photoCount === 0) return "No photos came with this record.";
  if (!photoFolder) {
    return (
      `The record says it has ${plural(photoCount, "photo")}, but it didn’t ` +
      "come from the app, or the account that sent it was deleted before " +
      "photos were linked to accounts, so they can’t be found."
    );
  }
  return (
    `The phone took ${plural(photoCount, "photo")}, but none have uploaded ` +
    "yet. They go up after the record, the next time the account that sent " +
    "it is signed in on the phone with signal."
  );
}

/**
 * Later visits to the plant whose first record this is, newest first, or null
 * when they didn't load. A database without 028_record_visits.sql has none.
 */
async function loadVisits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<StaffRecord[] | null> {
  const { data, error } = await supabase
    .from("records_staff")
    .select("*")
    .eq("visit_of", id);
  if (sqlIsMissing(error)) return [];
  if (error) {
    console.error("Loading the visits failed:", error.message);
    return null;
  }
  return newestVisitsFirst(data.map(recordFromRow));
}

/**
 * The species the Species box suggests. Names only. When they don't load the
 * box still works, it just has nothing to suggest.
 */
async function loadSpeciesOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<SpeciesOption[]> {
  const { data, error } = await supabase
    .from("species_staff")
    .select("id, scientific_name, common_names")
    .order("scientific_name");
  if (error) {
    console.error("Loading the species for the suggestions failed:", error.message);
    return [];
  }
  return data
    .map((row) => speciesOptionFromRow(row))
    .filter((option): option is SpeciesOption => option !== null);
}

export default async function EditRecordPage({
  params,
}: PageProps<"/dashboard/records/[id]/edit">) {
  const me = await requireStaff();
  if (!me) return null;

  // Record IDs are UUIDs, so anything else can't be a record and doesn't go
  // to the database
  const { id } = await params;
  if (!RECORD_ID.test(id)) notFound();

  // records_staff only answers officers and admins (supabase/006)
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("records_staff")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <Link
        href="/dashboard/records"
        className="inline-flex min-h-11 items-center gap-1.5 font-bold text-moss hover:text-ink"
      >
        <Icon name="arrow-left" className="size-4" />
        Records
      </Link>
    </nav>
  );

  if (error) {
    console.error("Loading the record to edit failed:", error.message);
    return (
      <div>
        {breadcrumb}
        <PageHeader eyebrow="Plant records" title="Edit a record" />
        <p
          role="alert"
          className="mt-8 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          The record didn’t load. Refresh the page, and if it keeps happening,{" "}
          {ifItKeepsHappening(me.role)}
        </p>
      </div>
    );
  }
  if (!data) notFound();

  const record = recordFromRow(data);
  const [photos, history, visits, speciesOptions] = await Promise.all([
    record.photoFolder
      ? recordPhotoLinks(supabase, record.photoFolder, record.id)
      : ([] as RecordPhoto[]),
    loadHistory(supabase, "record", record.id),
    record.visitOf ? ([] as StaffRecord[]) : loadVisits(supabase, record.id),
    loadSpeciesOptions(supabase),
  ]);

  return (
    <div>
      {breadcrumb}
      <PageHeader
        eyebrow="Plant records"
        title={`Edit ${record.tagCode}`}
        description={
          <>
            {STATUS_LABEL[record.status]}
            {record.recordedBy && <>, recorded by {record.recordedBy}</>}. The
            tag, who recorded it and its status don’t change here. A published
            record stays published, and visitors see your changes as soon as
            you save.
          </>
        }
      />
      <RecordForm
        id={record.id}
        tag={record.tagCode}
        initial={valuesFromRecord(record)}
        version={String(data.updated_at ?? "")}
        species={speciesOptions}
      />

      <section
        aria-labelledby="visits-heading"
        className="mt-14 max-w-2xl border-t border-line pt-10"
      >
        <h2 id="visits-heading" className="text-2xl font-bold tracking-tight">
          {record.visitOf ? "First record" : "Later visits"}
        </h2>
        {record.visitOf ? (
          <p className="mt-1 text-moss">
            This is a visit to{" "}
            <Link
              href={`/dashboard/records/${record.visitOf}/edit`}
              className="font-mono font-bold text-forest hover:underline"
            >
              {tagCode(record.visitOf)}
            </Link>
            . It’s a record of its own, so editing it doesn’t change the first
            record. The plant keeps the tag of its first record.
          </p>
        ) : visits === null ? (
          <p className="mt-5 flex items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            The visits didn’t load. Refresh the page to try again.
          </p>
        ) : visits.length > 0 ? (
          <>
            <p className="mt-1 text-moss">
              The field team came back to this plant{" "}
              {plural(visits.length, "time")}. Each visit is a record of its
              own. Newest first.
            </p>
            <ul className="mt-5 divide-y divide-line rounded-xl border border-line bg-sheet">
              {visits.map((visit) => (
                <li key={visit.id}>
                  <Link
                    href={`/dashboard/records/${visit.id}/edit`}
                    className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 p-4 hover:bg-paper"
                  >
                    <span className="font-mono text-sm font-bold">
                      {visit.tagCode}
                    </span>
                    <span>{formatDateTime(visit.recordedAt)}</span>
                    <ConditionBadge condition={visit.condition} />
                    <span className="text-sm text-moss">
                      {STATUS_LABEL[visit.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-line p-4 text-moss">
            No visits to this plant yet. When the field team checks on it again,
            the phone adds a visit here instead of changing this record.
          </p>
        )}
      </section>

      <section
        aria-labelledby="field-photos-heading"
        className="mt-14 max-w-2xl border-t border-line pt-10"
      >
        <h2 id="field-photos-heading" className="text-2xl font-bold tracking-tight">
          Photos from the field
        </h2>
        <p className="mt-1 text-moss">
          Only officers and administrators can see these, because a photo can
          show where the plant grows. They never go on the public site.
        </p>
        {photos === null ? (
          <p className="mt-5 flex items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            The photos didn’t load. Refresh the page to try again.
          </p>
        ) : photos.length > 0 ? (
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <li key={photo.name}>
                {/* Each link works for an hour, so it opens the full photo in this tab */}
                <a
                  href={photo.src}
                  className="block overflow-hidden rounded-lg border border-line bg-paper"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a signed link to a private file, which the image optimizer can't cache */}
                  <img
                    src={photo.src}
                    alt={`Photo ${index + 1} of ${record.tagCode}`}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-line p-4 text-moss">
            {noPhotosText(record.photoCount, record.photoFolder)}
          </p>
        )}
      </section>

      <EditHistory history={history} what="record" role={me.role} />
    </div>
  );
}

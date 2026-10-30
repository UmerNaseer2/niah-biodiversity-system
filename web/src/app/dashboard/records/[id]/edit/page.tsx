import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { EditHistory } from "@/components/edit-history";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import { plural } from "@/lib/format";
import { loadHistory } from "@/lib/history";
import { RECORD_ID } from "@/lib/record-form";
import { recordPhotoLinks, type RecordPhoto } from "@/lib/record-photos";
import { recordFromRow, STATUS_LABEL, valuesFromRecord } from "@/lib/records-staff";
import { createClient } from "@/lib/supabase/server";
import { RecordForm } from "../../record-form";

export const metadata: Metadata = { title: "Edit a record" };

/** What the photos section says when there's nothing to show */
function noPhotosText(photoCount: number, submittedBy: string | null) {
  if (photoCount === 0) return "No photos came with this record.";
  if (!submittedBy) {
    return (
      `The record says it has ${plural(photoCount, "photo")}, but it didn’t ` +
      "come from the app, or the account that sent it was deleted, so they " +
      "can’t be found."
    );
  }
  return (
    `The phone took ${plural(photoCount, "photo")}, but none have uploaded ` +
    "yet. The app starts uploading photos with item 11."
  );
}

export default async function EditRecordPage({
  params,
}: PageProps<"/dashboard/records/[id]/edit">) {
  if (!(await requireStaff())) return null;

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
          The record didn’t load. Refresh the page, and if it keeps happening,
          ask an administrator to check the database is up to date
          (supabase/README.md).
        </p>
      </div>
    );
  }
  if (!data) notFound();

  const record = recordFromRow(data);
  const [photos, history] = await Promise.all([
    record.submittedBy
      ? recordPhotoLinks(supabase, record.submittedBy, record.id)
      : ([] as RecordPhoto[]),
    loadHistory(supabase, "record", record.id),
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
      />

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
            {noPhotosText(record.photoCount, record.submittedBy)}
          </p>
        )}
      </section>

      <EditHistory history={history} what="record" />
    </div>
  );
}

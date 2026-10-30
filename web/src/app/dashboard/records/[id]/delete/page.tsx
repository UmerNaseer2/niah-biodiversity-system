import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { LatinName } from "@/components/plant-bits";
import { requireStaff } from "@/lib/auth";
import { plural } from "@/lib/format";
import { RECORD_ID } from "@/lib/record-form";
import { recordFromRow, STATUS_LABEL } from "@/lib/records-staff";
import { createClient } from "@/lib/supabase/server";
import { DeleteRecordForm } from "./delete-record-form";

export const metadata: Metadata = { title: "Delete a record" };

export default async function DeleteRecordPage({
  params,
}: PageProps<"/dashboard/records/[id]/delete">) {
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
    console.error("Loading the record to delete failed:", error.message);
    return (
      <div>
        {breadcrumb}
        <PageHeader eyebrow="Plant records" title="Delete a record" />
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

  return (
    <div>
      {breadcrumb}
      <PageHeader eyebrow="Plant records" title={`Delete ${record.tagCode}?`} />
      <section aria-labelledby="what-happens" className="card mt-8 max-w-2xl p-5 sm:p-6">
        <h2 id="what-happens" className="text-xl font-bold tracking-tight">
          What happens when you delete it
        </h2>
        <p className="mt-3">
          <LatinName name={record.speciesName} />, {STATUS_LABEL[record.status].toLowerCase()}
          {record.recordedBy && <>, recorded by {record.recordedBy}</>}.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            The record leaves the database for good.
            {record.status === "published" &&
              " It disappears from the public site straight away."}
          </li>
          <li>
            The tag {record.tagCode} stops working. Anyone who scans its QR
            code finds nothing, so only delete a record if the tag has come off
            the plant too.
          </li>
          {record.photoCount > 0 && (
            <li>
              Its {plural(record.photoCount, "photo")} from the field are
              deleted too, once they’ve uploaded. A photo the phone hasn’t
              uploaded yet stays on the phone.
            </li>
          )}
          <li>
            The phone that recorded it keeps its own copy. If that phone hasn’t
            synced the record yet, the server turns it down at the next sync and
            the phone says an officer deleted it, with a button to remove it from
            the phone. You can’t undo this.
          </li>
        </ul>
        <DeleteRecordForm id={record.id} version={String(data.updated_at ?? "")} />
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import { RECORD_ID } from "@/lib/record-form";
import { recordFromRow, STATUS_LABEL, valuesFromRecord } from "@/lib/records-staff";
import { createClient } from "@/lib/supabase/server";
import { RecordForm } from "../../record-form";

export const metadata: Metadata = { title: "Edit a record" };

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
      <RecordForm id={record.id} tag={record.tagCode} initial={valuesFromRecord(record)} />
    </div>
  );
}

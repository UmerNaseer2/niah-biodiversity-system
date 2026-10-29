import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { ConditionBadge, LatinName } from "@/components/plant-bits";
import { requireStaff } from "@/lib/auth";
import { formatDateTime, plural } from "@/lib/format";
import {
  recordFromRow,
  STAFF_STATUSES,
  STATUS_LABEL,
  type StaffStatus,
} from "@/lib/records-staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Records" };

// A tag code like NNP-3F2A9C, the same shape lib/tags.ts makes
const TAG = /^NNP-[0-9A-F]{6}$/;

export default async function RecordsPage({
  searchParams,
}: PageProps<"/dashboard/records">) {
  if (!(await requireStaff())) return null;
  const { deleted, status } = await searchParams;
  const filter = STAFF_STATUSES.find((s) => s === status) ?? null;

  // records_staff only answers officers and admins (supabase/006)
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("records_staff")
    .select("*")
    .order("recorded_at", { ascending: false });

  const header = (
    <PageHeader
      eyebrow="Plant records"
      title="Records"
      description="Every plant record the field teams have uploaded, with the exact spot and notes. Fix a mistake with Edit, or remove a record that shouldn’t be in the database with Delete."
    />
  );

  if (error) {
    console.error("Loading the records list failed:", error.message);
    return (
      <div>
        {header}
        <p
          role="alert"
          className="mt-8 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          The records didn’t load. Refresh the page, and if it keeps happening,
          ask an administrator to check the database is up to date
          (supabase/README.md).
        </p>
      </div>
    );
  }

  const all = data.map(recordFromRow);
  const counts = Object.fromEntries(
    STAFF_STATUSES.map((s) => [s, all.filter((r) => r.status === s).length]),
  ) as Record<StaffStatus, number>;
  const rows = filter ? all.filter((r) => r.status === filter) : all;

  // Deleting a record sends the officer here with its tag (actions.ts). Only a
  // tag that isn't in the list shows, so a made up link can't put other text
  // on the page.
  const deletedTag =
    typeof deleted === "string" && TAG.test(deleted) && !all.some((r) => r.tagCode === deleted)
      ? deleted
      : null;

  const tabs: { label: string; href: string; count: number; current: boolean }[] = [
    { label: "All", href: "/dashboard/records", count: all.length, current: !filter },
    ...STAFF_STATUSES.map((s) => ({
      label: STATUS_LABEL[s],
      href: `/dashboard/records?status=${s}`,
      count: counts[s],
      current: filter === s,
    })),
  ];

  return (
    <div>
      {header}

      {deletedTag && (
        <p
          role="status"
          className="mt-8 flex max-w-2xl items-start gap-2.5 rounded-xl border border-line bg-sheet p-4"
        >
          <Icon name="check" className="mt-0.5 size-4 shrink-0 text-ok" />
          <span>Record {deletedTag} was deleted. Its tag no longer works.</span>
        </p>
      )}

      <nav aria-label="Filter by status" className={`${deletedTag ? "mt-4" : "mt-8"} flex flex-wrap gap-2`}>
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.current ? "page" : undefined}
            className={`btn ${tab.current ? "btn-primary" : "btn-secondary"}`}
          >
            {tab.label}
            <span className="font-normal">{tab.count}</span>
          </Link>
        ))}
      </nav>

      <div
        role="region"
        aria-labelledby="records-table-caption"
        tabIndex={0}
        className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-sheet"
      >
        <table className="w-full min-w-[56rem] text-left text-sm">
          <caption id="records-table-caption" className="sr-only">
            {plural(rows.length, "record")}
            {filter ? `, ${STATUS_LABEL[filter].toLowerCase()}` : ""}
          </caption>
          <thead className="border-b border-line bg-paper/60 text-moss">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-bold">Tag</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Species</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Condition</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Status</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Recorded</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Edited</th>
              <th scope="col" className="px-4 py-2.5 font-bold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-moss">
                  {filter
                    ? `No records are ${STATUS_LABEL[filter].toLowerCase()}.`
                    : "There aren’t any records in the database yet."}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-bold">
                  {row.tagCode}
                </th>
                <td className="px-4 py-3">
                  <LatinName name={row.speciesName} />
                  {row.commonName && <span className="block">{row.commonName}</span>}
                  {!row.speciesSlug && (
                    <span className="block text-xs font-bold text-moss">No species yet</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ConditionBadge condition={row.condition} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">{STATUS_LABEL[row.status]}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDateTime(row.recordedAt)}
                  {row.recordedBy && (
                    <span className="block text-xs text-moss">{row.recordedBy}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {row.updatedAt ? formatDateTime(row.updatedAt) : "Not yet"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/dashboard/records/${row.id}/edit`} className="btn btn-secondary">
                      Edit
                      <span className="sr-only"> {row.tagCode}</span>
                    </Link>
                    <Link href={`/dashboard/records/${row.id}/delete`} className="btn btn-danger">
                      Delete
                      <span className="sr-only"> {row.tagCode}</span>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

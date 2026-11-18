import type { Metadata } from "next";
import Form from "next/form";
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
import { searchFilter, searchTermFrom, SEARCH_MAX } from "@/lib/records-search";
import { ifItKeepsHappening } from "@/lib/setup-hint";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Records" };

// A tag code like NNP-3F2A9C, the same shape lib/tags.ts makes
const TAG = /^NNP-[0-9A-F]{6}$/;

// How many records one page of the list shows. With every record on one page, 10,000 records
// made the page take over half a minute and several megabytes to load
// (docs/test-results/item-37-performance.md).
const PER_PAGE = 100;

/** Which page of the list to show, from ?page=2. Anything that isn't a page number gives the first. */
function pageFrom(value: unknown) {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function pageHref(status: StaffStatus | null, page: number, search: string | null) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/dashboard/records${query ? `?${query}` : ""}`;
}

export default async function RecordsPage({
  searchParams,
}: PageProps<"/dashboard/records">) {
  const me = await requireStaff();
  if (!me) return null;
  const { deleted, status, page: pageParam, q } = await searchParams;
  const filter = STAFF_STATUSES.find((s) => s === status) ?? null;
  const search = searchTermFrom(q);
  const page = pageFrom(pageParam);
  const from = (page - 1) * PER_PAGE;
  const askedAboutTag = typeof deleted === "string" && TAG.test(deleted) ? deleted : null;

  // records_staff only answers officers and admins (supabase/006). The database counts each
  // status, and the list is one page of records, plus one more to know if there's an older page.
  // A search is one more filter on the list and the counts, so the database does the matching.
  const supabase = await createClient();
  let list = supabase.from("records_staff").select("*");
  if (filter) list = list.eq("status", filter);
  if (search) list = list.or(searchFilter(search));
  const [listResult, deletedResult, ...countResults] = await Promise.all([
    list
      .order("recorded_at", { ascending: false })
      .order("id")
      .range(from, from + PER_PAGE),
    askedAboutTag
      ? supabase
          .from("records_staff")
          .select("id", { count: "exact", head: true })
          .eq("tag_code", askedAboutTag)
      : null,
    ...STAFF_STATUSES.map((s) => {
      const count = supabase
        .from("records_staff")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      return search ? count.or(searchFilter(search)) : count;
    }),
  ]);
  const error =
    listResult.error ?? deletedResult?.error ?? countResults.find((r) => r.error)?.error ?? null;

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
          The records didn’t load. Refresh the page, and if it keeps happening,{" "}
          {ifItKeepsHappening(me.role)}
        </p>
      </div>
    );
  }

  const counts = Object.fromEntries(
    STAFF_STATUSES.map((s, i) => [s, countResults[i].count ?? 0]),
  ) as Record<StaffStatus, number>;
  const total = STAFF_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  const shownTotal = filter ? counts[filter] : total;
  const rows = (listResult.data ?? []).slice(0, PER_PAGE).map(recordFromRow);
  const hasOlder = (listResult.data?.length ?? 0) > PER_PAGE;
  const first = from + 1;
  const last = from + rows.length;

  // Deleting a record sends the officer here with its tag (actions.ts). Only a
  // tag that isn't in the database shows, so a made up link can't put other
  // text on the page.
  const deletedTag = askedAboutTag && deletedResult?.count === 0 ? askedAboutTag : null;

  const tabs: { label: string; href: string; count: number; current: boolean }[] = [
    { label: "All", href: pageHref(null, 1, search), count: total, current: !filter },
    ...STAFF_STATUSES.map((s) => ({
      label: STATUS_LABEL[s],
      href: pageHref(s, 1, search),
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

      <Form
        key={search ?? ""}
        action="/dashboard/records"
        role="search"
        className={`${deletedTag ? "mt-4" : "mt-8"} max-w-2xl`}
      >
        <label htmlFor="records-search" className="font-bold">
          Search records
        </label>
        <p id="records-search-hint" className="text-sm text-moss">
          Looks in the tag code, the species names and the notes.
        </p>
        {filter && <input type="hidden" name="status" value={filter} />}
        <div className="mt-2 flex gap-2">
          <input
            id="records-search"
            type="search"
            name="q"
            defaultValue={search ?? ""}
            maxLength={SEARCH_MAX}
            autoComplete="off"
            aria-describedby="records-search-hint"
            placeholder="NNP-3F2A9C, Belian, riverbank…"
            className="field min-w-0 flex-1"
          />
          <button type="submit" className="btn btn-primary">
            <Icon name="search" />
            Search
          </button>
        </div>
      </Form>

      <nav aria-label="Filter by status" className="mt-4 flex flex-wrap gap-2">
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
            {plural(shownTotal, "record")}
            {filter ? `, ${STATUS_LABEL[filter].toLowerCase()}` : ""}
            {search ? `, matching “${search}”` : ""}
            {page > 1 || hasOlder ? `, ${first} to ${last} shown` : ""}
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
                  {page > 1 ? (
                    <>
                      There aren’t that many records.{" "}
                      <Link href={pageHref(filter, 1, search)} className="font-bold text-forest underline">
                        Go to the newest
                      </Link>
                      .
                    </>
                  ) : search ? (
                    <>
                      No records match “{search}”{filter ? ` in ${STATUS_LABEL[filter].toLowerCase()}` : ""}.{" "}
                      <Link href={pageHref(filter, 1, null)} className="font-bold text-forest underline">
                        Clear the search
                      </Link>
                      .
                    </>
                  ) : filter ? (
                    `No records are ${STATUS_LABEL[filter].toLowerCase()}.`
                  ) : (
                    "There aren’t any records in the database yet."
                  )}
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

      {(page > 1 || hasOlder) && rows.length > 0 && (
        <nav
          aria-label="Pages of records"
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-moss">
            Records {first} to {last} of {shownTotal}
            {search ? ` matching “${search}”` : ""}, newest first
          </p>
          <div className="flex gap-3">
            {page > 1 && (
              <Link href={pageHref(filter, page - 1, search)} className="btn btn-secondary">
                <Icon name="arrow-left" className="size-4" />
                Newer
              </Link>
            )}
            {hasOlder && (
              <Link href={pageHref(filter, page + 1, search)} className="btn btn-secondary">
                Older
                <Icon name="arrow-right" className="size-4" />
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

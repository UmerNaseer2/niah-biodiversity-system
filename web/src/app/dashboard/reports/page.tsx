import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import { CONDITION_LABEL } from "@/lib/condition";
import { formatDate, formatDateTime, plural } from "@/lib/format";
import {
  filtersFrom,
  filtersQuery,
  rangeLabel,
  SCOPE_LABEL,
  summarise,
  type ReportFilters,
  type ReportScope,
} from "@/lib/reports";
import { loadReportRecords } from "@/lib/reports-db";
import { BarTable } from "./bar-table";
import { PrintButton } from "./print-button";
import { ReportBuilder, type PreviewRow } from "./report-builder";

export const metadata: Metadata = { title: "Reports" };

const LABEL = "block text-sm font-bold";

/** "any date", "from 1 Oct 2026", "1 Oct 2026 to 31 Oct 2026" */
function datesLabel({ from, to }: ReportFilters) {
  if (from && to) return rangeLabel(from, to);
  if (from) return `from ${formatDate(from)}`;
  if (to) return `up to ${formatDate(to)}`;
  return "any date";
}

/** "between 2 Oct 2026 and 12 Oct 2026", or "on 2 Oct 2026" */
function spanLabel(first: string, last: string) {
  const a = formatDate(first);
  const b = formatDate(last);
  return a === b ? `on ${a}` : `between ${a} and ${b}`;
}

export default async function ReportsPage({
  searchParams,
}: PageProps<"/dashboard/reports">) {
  if (!(await requireStaff())) return null;
  const filters = filtersFrom(await searchParams);
  const query = filtersQuery(filters).toString();
  const rows = await loadReportRecords(filters);

  const header = (
    <PageHeader
      eyebrow="Records"
      title="Reports"
      description="Counts of the plant records for SFC, by IUCN status, condition, species and month. Print it or save it as a PDF, or download the records as a spreadsheet."
      aside={rows && rows.length > 0 ? <PrintButton /> : undefined}
    />
  );

  const filterForm = (
    <Form
      key={query}
      action="/dashboard/reports"
      aria-label="Report filters"
      className="mt-8 flex flex-wrap items-end gap-3 print:hidden"
    >
      <div className="w-full sm:w-auto">
        <label htmlFor="scope" className={LABEL}>
          Records
        </label>
        <select
          id="scope"
          name="scope"
          defaultValue={filters.scope}
          className="field mt-1.5"
        >
          {(Object.keys(SCOPE_LABEL) as ReportScope[]).map((scope) => (
            <option key={scope} value={scope}>
              {SCOPE_LABEL[scope]}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-36 flex-1 sm:flex-none">
        <label htmlFor="from" className={LABEL}>
          From
        </label>
        <input
          id="from"
          type="date"
          name="from"
          defaultValue={filters.from ?? ""}
          className="field mt-1.5"
        />
      </div>
      <div className="min-w-36 flex-1 sm:flex-none">
        <label htmlFor="to" className={LABEL}>
          To
        </label>
        <input
          id="to"
          type="date"
          name="to"
          defaultValue={filters.to ?? ""}
          className="field mt-1.5"
        />
      </div>
      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary">
          Update report
        </button>
        {query && (
          <Link href="/dashboard/reports" className="btn btn-secondary">
            Clear
          </Link>
        )}
      </div>
    </Form>
  );

  if (!rows) {
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

  const summary = summarise(rows);

  if (summary.total === 0) {
    return (
      <div>
        {header}
        {filterForm}
        <div className="mt-8 rounded-xl border border-dashed border-pencil bg-sheet p-8 text-center">
          <p className="font-bold">No records match these filters</p>
          <p className="mt-1 text-moss">
            Try a wider date range, or include records waiting for review.
            Rejected records never count.
          </p>
        </div>
      </div>
    );
  }

  const tiles = [
    {
      label: "Records",
      value: summary.total,
      note: summary.waiting > 0 ? `${summary.waiting} waiting for review` : null,
    },
    {
      label: "Species recorded",
      value: summary.speciesCount,
      note:
        summary.notMatched > 0
          ? `${plural(summary.notMatched, "record")} not matched yet`
          : null,
    },
    {
      label: "Threatened or protected",
      value: summary.threatened,
      note: "Records of these species",
    },
    {
      label: "Damaged, diseased or dead",
      value: summary.needsCare,
      note: "When they were recorded",
    },
  ];

  const preview: PreviewRow[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.commonName ?? r.scientificName,
    status: r.status,
    condition: CONDITION_LABEL[r.condition],
    recordedAt: formatDateTime(r.recordedAt),
    hidesLocation: r.hidesLocation,
    hasGps: r.gps !== null,
  }));

  return (
    <div>
      {header}
      {filterForm}

      <p className="mt-6 text-moss">
        <strong className="text-ink">{plural(summary.total, "record")}</strong>{" "}
        made {summary.first && summary.last && spanLabel(summary.first, summary.last)}.{" "}
        {SCOPE_LABEL[filters.scope]}, {datesLabel(filters)}. Rejected records
        never count.
      </p>

      <section aria-labelledby="counts-heading" className="mt-4">
        <h2 id="counts-heading" className="sr-only">
          Counts
        </h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line [print-color-adjust:exact] lg:grid-cols-4 print:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="flex flex-col bg-sheet p-4 sm:p-5">
              <dt className="text-sm font-bold">{tile.label}</dt>
              <dd className="order-first text-2xl font-bold tracking-tight">
                {tile.value}
              </dd>
              {tile.note && <dd className="text-sm text-moss">{tile.note}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2 print:grid-cols-2">
        <BarTable
          id="by-iucn"
          title="By IUCN status"
          description="The Red List status of each record’s species."
          labelHeading="IUCN status"
          counts={summary.byIucn}
        />
        <BarTable
          id="by-condition"
          title="By condition"
          description="How each plant looked when it was recorded."
          labelHeading="Condition"
          counts={summary.byCondition}
        />
        <BarTable
          id="by-species"
          title="By species"
          description="Every species with at least one record, most recorded first."
          labelHeading="Species"
          counts={summary.bySpecies}
          className="lg:col-span-2 print:col-span-2"
        />
      </div>

      <section
        aria-labelledby="by-month-heading"
        className="card mt-6 break-inside-avoid p-5 sm:p-6"
      >
        <h2 id="by-month-heading" className="text-lg font-bold tracking-tight">
          Month by month
        </h2>
        <p className="mt-1 text-sm text-moss">
          Records per month, split by the condition of each plant.
        </p>
        <div
          role="region"
          aria-labelledby="by-month-heading"
          tabIndex={0}
          className="mt-4 overflow-x-auto"
        >
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="border-b border-line text-moss">
              <tr>
                <th scope="col" className="py-2 pr-4 text-left font-bold">
                  Month
                </th>
                <th scope="col" className="px-3 py-2 text-right font-bold">
                  Records
                </th>
                {summary.byCondition.map((c) => (
                  <th key={c.key} scope="col" className="px-3 py-2 text-right font-bold">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {summary.byMonth.map((m) => (
                <tr key={m.month}>
                  <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                    {m.label}
                  </th>
                  <td className="px-3 py-2.5 text-right font-bold">{m.total}</td>
                  {summary.byCondition.map((c) => (
                    <td key={c.key} className="px-3 py-2.5 text-right">
                      {m.byCondition[c.key as keyof typeof m.byCondition]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="download-heading"
        className="mt-12 border-t border-line pt-8 print:hidden"
      >
        <h2 id="download-heading" className="text-xl font-bold tracking-tight">
          Download the records
        </h2>
        <p className="mt-1 max-w-2xl text-moss">
          A spreadsheet of the same {plural(summary.total, "record")}, one row
          each. The server builds the file after checking you’re an officer or
          administrator.
        </p>
        <ReportBuilder filters={filters} rows={preview} />
      </section>
    </div>
  );
}

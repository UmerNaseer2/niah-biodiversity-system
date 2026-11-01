"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { plural } from "@/lib/format";
import type { ReportFilters } from "@/lib/reports";

/** One row of the preview. No coordinates, those only go into the file. */
export type PreviewRow = {
  id: string;
  code: string;
  name: string;
  status: "published" | "waiting";
  condition: string;
  recordedAt: string;
  hidesLocation: boolean;
  hasGps: boolean;
};

/**
 * A plain GET form to /dashboard/reports/csv. The server checks the role and
 * sends the file back as a download, so the browser stays on this page.
 */
export function ReportBuilder({
  filters,
  rows,
  total,
  hiddenCount,
}: {
  filters: ReportFilters;
  /** The first few rows. The page only sends what the preview shows. */
  rows: PreviewRow[];
  /** How many rows the file has */
  total: number;
  /** How many rows of the file say Hidden unless exact spots are included */
  hiddenCount: number;
}) {
  const [includeExact, setIncludeExact] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  return (
    <div className="mt-6 grid gap-8 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <form
        method="get"
        action="/dashboard/reports/csv"
        onSubmit={() =>
          setAnnouncement(`Downloading a CSV file with ${plural(total, "record")}.`)
        }
        className="max-w-md space-y-6"
      >
        {filters.scope === "all" && <input type="hidden" name="scope" value="all" />}
        {filters.from && <input type="hidden" name="from" value={filters.from} />}
        {filters.to && <input type="hidden" name="to" value={filters.to} />}

        <div>
          <div className="flex items-start gap-3">
            <input
              id="include-exact"
              type="checkbox"
              name="exact"
              value="1"
              checked={includeExact}
              onChange={(event) => setIncludeExact(event.target.checked)}
              aria-describedby="include-exact-hint"
              className="mt-0.5 size-5 shrink-0 accent-forest"
            />
            <div>
              <label htmlFor="include-exact" className="font-bold">
                Include exact spots of threatened and protected plants
              </label>
              <p id="include-exact-hint" className="text-sm text-moss">
                Left off, those rows say Hidden, with no coordinates, notes or
                time of day. Plants not matched to a species yet stay hidden
                too.
              </p>
            </div>
          </div>
          {includeExact && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
              <Icon name="alert" className="mt-0.5 size-4" />
              <span>
                <strong>Only share this file with SFC staff.</strong> Anyone
                who has it can walk straight to these plants. Your name goes
                on a list of these downloads that administrators can see.
              </span>
            </p>
          )}
        </div>

        <div className="border-t border-line pt-6">
          <button type="submit" className="btn btn-primary w-full">
            <Icon name="download" className="size-4" />
            Download CSV
          </button>
          <p className="mt-2 text-center text-sm text-moss">
            {plural(total, "row")}, opens in Excel or Google Sheets
          </p>
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </div>
      </form>

      <section aria-labelledby="preview-heading" className="min-w-0">
        <h3 id="preview-heading" className="text-lg font-bold tracking-tight">
          Preview
        </h3>
        <p className="text-sm text-moss">
          The file also has the scientific name, family, IUCN status, height,
          who recorded it, GPS accuracy and notes.
          {hiddenCount > 0 &&
            !includeExact &&
            ` ${plural(hiddenCount, "row")} will say Hidden.`}
        </p>
        <div
          role="region"
          aria-labelledby="preview-heading"
          tabIndex={0}
          className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-sheet"
        >
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line bg-paper/60 text-moss">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-bold">Tag</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Species</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Status</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Condition</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Recorded</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-bold">
                    {row.code}
                  </td>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3">
                    {row.status === "published" ? (
                      <span className="font-bold text-ok">Published</span>
                    ) : (
                      <span className="font-bold text-warn">Waiting</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.condition}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.recordedAt}</td>
                  <td className="px-4 py-3">
                    {!row.hasGps ? (
                      <span className="text-moss">No GPS point</span>
                    ) : row.hidesLocation && !includeExact ? (
                      <span className="inline-flex items-center gap-1.5 font-bold text-moss">
                        <Icon name="lock" className="size-4" />
                        Hidden
                      </span>
                    ) : (
                      "Exact"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > rows.length && (
          <p className="mt-2 text-sm text-moss">
            And {total - rows.length} more in the file.
          </p>
        )}
      </section>
    </div>
  );
}

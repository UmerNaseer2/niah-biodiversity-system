"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { CONDITION_LABEL, type Condition } from "@/lib/condition";
import { formatCoords, MOCK_NOW, plural } from "@/lib/format";
import { IUCN, type IucnCode } from "@/lib/iucn";

export type ReportRow = {
  id: string;
  code: string;
  commonName: string;
  scientificName: string;
  family: string;
  iucn: IucnCode;
  hidesLocation: boolean;
  status: "published" | "waiting";
  heightM: number;
  condition: Condition;
  recordedBy: string;
  recordedAt: string;
  recordedAtLabel: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  notes: string | null;
};

type Scope = "published" | "all";

const FILE_NAME = `niah-plant-records-${MOCK_NOW.slice(0, 10)}.csv`;

const HEADERS = [
  "Tag code",
  "Common name",
  "Scientific name",
  "Family",
  "IUCN status",
  "Review status",
  "Height (m)",
  "Condition",
  "Recorded by",
  "Recorded at",
  "Location",
  "Latitude",
  "Longitude",
  "GPS accuracy (m)",
  "Notes",
];

/**
 * One CSV cell. Text starting with = + - @ or a tab gets a ' in front so
 * Excel shows it instead of running it as a formula, since notes come from
 * whatever the ranger typed.
 */
function csvCell(value: string | number | null) {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function locationOf(row: ReportRow, includeExact: boolean) {
  if (row.lat === null || row.lng === null) return "No GPS point";
  if (row.hidesLocation && !includeExact) return "Hidden";
  return "Exact";
}

function buildCsv(rows: ReportRow[], includeExact: boolean) {
  const lines = rows.map((row) => {
    const location = locationOf(row, includeExact);
    const showPoint = location === "Exact";
    return [
      row.code,
      row.commonName,
      row.scientificName,
      row.family,
      `${IUCN[row.iucn].label} (${row.iucn})`,
      row.status === "published" ? "Public" : "Waiting for review",
      row.heightM,
      CONDITION_LABEL[row.condition],
      row.recordedBy,
      row.recordedAt,
      location,
      showPoint ? row.lat : null,
      showPoint ? row.lng : null,
      showPoint ? row.accuracyM : null,
      row.notes,
    ]
      .map(csvCell)
      .join(",");
  });
  return [HEADERS.map(csvCell).join(","), ...lines].join("\r\n");
}

export function ReportBuilder({ rows }: { rows: ReportRow[] }) {
  const [scope, setScope] = useState<Scope>("published");
  const [includeExact, setIncludeExact] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const chosen = scope === "all" ? rows : rows.filter((r) => r.status === "published");
  const publishedCount = rows.filter((r) => r.status === "published").length;
  const hiddenCount = chosen.filter(
    (r) => r.hidesLocation && r.lat !== null,
  ).length;

  function download() {
    // The BOM makes Excel open the file as UTF-8
    const blob = new Blob([`\uFEFF${buildCsv(chosen, includeExact)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = FILE_NAME;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement(`Downloaded ${FILE_NAME} with ${plural(chosen.length, "record")}.`);
  }

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="max-w-md space-y-7">
        <fieldset>
          <legend className="font-bold">Which records</legend>
          <div className="mt-3 space-y-3">
            <div className="flex items-start gap-3">
              <input
                id="scope-published"
                type="radio"
                name="scope"
                value="published"
                checked={scope === "published"}
                onChange={() => setScope("published")}
                className="mt-0.5 size-5 shrink-0 accent-forest"
              />
              <label htmlFor="scope-published">
                <span className="font-bold">Public records</span>{" "}
                <span className="text-moss">({publishedCount})</span>
              </label>
            </div>
            <div className="flex items-start gap-3">
              <input
                id="scope-all"
                type="radio"
                name="scope"
                value="all"
                checked={scope === "all"}
                onChange={() => setScope("all")}
                className="mt-0.5 size-5 shrink-0 accent-forest"
              />
              <label htmlFor="scope-all">
                <span className="font-bold">All records</span>{" "}
                <span className="text-moss">
                  ({rows.length}, including ones waiting for review)
                </span>
              </label>
            </div>
          </div>
        </fieldset>

        <div>
          <div className="flex items-start gap-3">
            <input
              id="include-exact"
              type="checkbox"
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
                Left off, those rows say Hidden and the coordinates are blank.
              </p>
            </div>
          </div>
          {includeExact && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
              <Icon name="alert" className="mt-0.5 size-4" />
              <span>
                <strong>Only share this file with SFC staff.</strong> Anyone
                who has it can walk straight to these plants.
              </span>
            </p>
          )}
        </div>

        <div className="border-t border-line pt-6">
          <button type="button" onClick={download} className="btn btn-primary w-full">
            <Icon name="download" className="size-4" />
            Download CSV
          </button>
          <p className="mt-2 text-center text-sm text-moss">
            {FILE_NAME}, {plural(chosen.length, "row")}
          </p>
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </div>
      </div>

      <section aria-labelledby="preview-heading" className="min-w-0">
        <h2 id="preview-heading" className="text-xl font-bold tracking-tight">
          Preview
        </h2>
        <p className="text-sm text-moss">
          The file also has the family, IUCN status, height, who recorded it,
          GPS accuracy and notes.
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
              {chosen.map((row) => {
                const location = locationOf(row, includeExact);
                return (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-bold">
                      {row.code}
                    </td>
                    <td className="px-4 py-3">{row.commonName}</td>
                    <td className="px-4 py-3">
                      {row.status === "published" ? (
                        <span className="font-bold text-ok">Public</span>
                      ) : (
                        <span className="font-bold text-warn">Waiting</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{CONDITION_LABEL[row.condition]}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.recordedAtLabel}
                    </td>
                    <td className="px-4 py-3">
                      {location === "Exact" && row.lat !== null && row.lng !== null ? (
                        <span className="font-mono">
                          {formatCoords(row.lat, row.lng)}
                        </span>
                      ) : location === "Hidden" ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-moss">
                          <Icon name="lock" className="size-4" />
                          Hidden
                        </span>
                      ) : (
                        <span className="text-moss">No GPS point</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

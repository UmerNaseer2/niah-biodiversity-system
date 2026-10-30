import { Icon } from "@/components/icon";
import { formatDate, formatTime } from "@/lib/format";
import { datesLabel, SCOPE_LABEL } from "@/lib/reports";
import type { ExactDownload } from "@/lib/reports-db";

/**
 * The latest reports downloaded with exact spots, for admins only. The
 * database keeps every one and nobody can change or remove them through the
 * website (supabase/011).
 */
export function DownloadList({
  downloads,
}: {
  downloads: ExactDownload[] | null;
}) {
  return (
    <section
      aria-labelledby="exact-downloads-heading"
      className="mt-12 border-t border-line pt-8 print:hidden"
    >
      <h2
        id="exact-downloads-heading"
        className="text-xl font-bold tracking-tight"
      >
        Downloads with exact spots
      </h2>
      <p className="mt-1 max-w-2xl text-moss">
        Who downloaded the records with the exact spots of threatened and
        protected plants, newest first. Only administrators see this list, and
        nobody can change it.
      </p>

      {!downloads ? (
        <p className="mt-6 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          The list didn’t load. If 011_exact_location_downloads.sql hasn’t been
          run yet, nobody can download exact spots until it is
          (supabase/README.md).
        </p>
      ) : downloads.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-pencil bg-sheet p-6 text-center text-moss">
          Nobody has downloaded exact spots yet.
        </p>
      ) : (
        <div
          role="region"
          aria-labelledby="exact-downloads-heading"
          tabIndex={0}
          className="mt-6 overflow-x-auto rounded-xl border border-line bg-sheet"
        >
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line bg-paper/60 text-moss">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-bold">
                  When
                </th>
                <th scope="col" className="px-4 py-2.5 font-bold">
                  Who
                </th>
                <th scope="col" className="px-4 py-2.5 font-bold">
                  Records
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-4 py-2.5 text-right font-bold"
                >
                  Rows
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-4 py-2.5 text-right font-bold"
                >
                  Exact spots
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {downloads.map((download) => (
                <tr key={download.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDate(download.downloadedAt)},{" "}
                    {formatTime(download.downloadedAt)}
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {download.downloadedBy}
                  </td>
                  <td className="px-4 py-3">
                    {SCOPE_LABEL[download.filters.scope]},{" "}
                    {datesLabel(download.filters)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {download.rowCount}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">
                    {download.exactCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

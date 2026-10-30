import Link from "next/link";
import { Icon } from "@/components/icon";
import { formatDate, formatTime } from "@/lib/format";
import { datesLabel, SCOPE_LABEL } from "@/lib/reports";
import { DOWNLOADS_PER_PAGE, type DownloadPage } from "@/lib/reports-db";

const HEADING_ID = "exact-downloads-heading";

/**
 * A link to another page of the list. It keeps the report filters, and the
 * hash takes you back down to the list instead of the top of the page.
 */
function pageHref(query: string, page: number) {
  const params = new URLSearchParams(query);
  if (page > 1) params.set("downloads", String(page));
  const search = params.toString();
  return `/dashboard/reports${search ? `?${search}` : ""}#${HEADING_ID}`;
}

/**
 * The reports downloaded with exact spots, a page at a time, for admins only.
 * The database keeps every one and nobody can change or remove them through
 * the website (supabase/011).
 */
export function DownloadList({
  list,
  query,
}: {
  list: DownloadPage | null;
  /** The report filters, so moving between pages keeps them */
  query: string;
}) {
  const first = list ? (list.page - 1) * DOWNLOADS_PER_PAGE + 1 : 0;
  const last = list ? first + list.downloads.length - 1 : 0;
  return (
    <section
      aria-labelledby="exact-downloads-heading"
      className="mt-12 border-t border-line pt-8 print:hidden"
    >
      <h2
        id={HEADING_ID}
        className="scroll-mt-6 text-xl font-bold tracking-tight"
      >
        Downloads with exact spots
      </h2>
      <p className="mt-1 max-w-2xl text-moss">
        Who downloaded the records with the exact spots of threatened and
        protected plants, newest first. Only administrators see this list, and
        nobody can change it.
      </p>

      {!list ? (
        <p className="mt-6 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          The list didn’t load. If 011_exact_location_downloads.sql hasn’t been
          run yet, nobody can download exact spots until it is
          (supabase/README.md).
        </p>
      ) : list.downloads.length === 0 && list.page === 1 ? (
        <p className="mt-6 rounded-xl border border-dashed border-pencil bg-sheet p-6 text-center text-moss">
          Nobody has downloaded exact spots yet.
        </p>
      ) : list.downloads.length === 0 ? (
        // Someone typed a page number past the end, or old rows were removed
        // in the Table Editor since the link was made
        <div className="mt-6 rounded-xl border border-dashed border-pencil bg-sheet p-6 text-center">
          <p className="text-moss">There are no downloads this far back.</p>
          <Link href={pageHref(query, 1)} className="btn btn-secondary mt-3">
            Back to the newest
          </Link>
        </div>
      ) : (
        <>
          <div
            role="region"
            aria-labelledby={HEADING_ID}
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
                {list.downloads.map((download) => (
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
          {(list.page > 1 || list.hasOlder) && (
            <nav
              aria-label="Pages of downloads"
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-moss">
                Downloads {first} to {last}, newest first
              </p>
              <div className="flex gap-3">
                {list.page > 1 && (
                  <Link
                    href={pageHref(query, list.page - 1)}
                    className="btn btn-secondary"
                  >
                    <Icon name="arrow-left" className="size-4" />
                    Newer
                  </Link>
                )}
                {list.hasOlder && (
                  <Link
                    href={pageHref(query, list.page + 1)}
                    className="btn btn-secondary"
                  >
                    Older
                    <Icon name="arrow-right" className="size-4" />
                  </Link>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

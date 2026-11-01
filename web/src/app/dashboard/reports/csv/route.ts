import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { parkNow } from "@/lib/format";
import { buildCsv, filtersFrom } from "@/lib/reports";
import { loadReportRecords, recordExactDownload } from "@/lib/reports-db";

function refuse(status: number, message: string) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * The reports CSV (item 21), built here on the server so exact spots only go
 * into the file, never into the reports page. Takes the same scope, from and
 * to as the page, plus exact=1 to include the exact spots of threatened and
 * protected plants. A download with exact=1 goes on a list admins can see
 * first (supabase/011).
 */
export async function GET(request: NextRequest) {
  // The proxy already sends anyone signed out to the sign in page. This
  // checks the role too, like requireStaff does for the pages.
  const session = await getSession();
  if (session.status === "unavailable") {
    return refuse(503, "The database isn’t answering. Try the download again in a minute.");
  }
  if (session.status !== "ok") {
    return refuse(
      session.status === "signed-out" ? 401 : 403,
      "Only conservation officers and administrators can download reports.",
    );
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const filters = filtersFrom(params);
  const includeExact = params.exact === "1";

  // A link on another site still sends the sign in cookies, so it could start
  // a download with exact spots, and put it on the admins' list, without the
  // officer meaning to. Browsers say where a request came from: "same-origin"
  // is the Reports page, and "none" is a typed address or a bookmark.
  const site = request.headers.get("sec-fetch-site");
  if (includeExact && site && site !== "same-origin" && site !== "none") {
    return refuse(
      403,
      "The file with exact spots only downloads from the Reports page, so a " +
        "link on another site can’t start it. Open Reports and download it there.",
    );
  }

  const rows = await loadReportRecords(filters);
  if (!rows) return refuse(500, "The records didn’t load. Go back and try again.");

  // Nobody gets the exact spots without a row on the list admins check
  if (includeExact && !(await recordExactDownload(filters, rows))) {
    return refuse(
      500,
      "The download couldn’t be recorded, so the file with exact spots wasn’t made. " +
        "Go back and try again, or download it without exact spots.",
    );
  }

  // Today in park time. Fine here, since nothing is rendered in the browser.
  const today = parkNow().slice(0, 10);
  const name = `niah-plant-records-${today}${includeExact ? "-exact-spots" : ""}.csv`;

  return new Response(buildCsv(rows, includeExact), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      // It can hold exact spots, so no browser or proxy should keep a copy
      "Cache-Control": "private, no-store",
    },
  });
}

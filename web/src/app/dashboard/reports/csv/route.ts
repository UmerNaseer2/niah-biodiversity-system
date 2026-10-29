import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { buildCsv, filtersFrom } from "@/lib/reports";
import { loadReportRecords } from "@/lib/reports-db";

const PARK_OFFSET_MS = 8 * 60 * 60 * 1000;

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
 * protected plants.
 */
export async function GET(request: NextRequest) {
  // The proxy already sends anyone signed out to the sign in page. This
  // checks the role too, like requireStaff does for the pages.
  const session = await getSession();
  if (session.status !== "ok") {
    return refuse(
      session.status === "signed-out" ? 401 : 403,
      "Only conservation officers and administrators can download reports.",
    );
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const filters = filtersFrom(params);
  const includeExact = params.exact === "1";

  const rows = await loadReportRecords(filters);
  if (!rows) return refuse(500, "The records didn’t load. Go back and try again.");

  if (includeExact) {
    // There's no audit table yet, so the server log is the only trace of who
    // took the exact spots
    console.info(`Report with exact spots downloaded by user ${session.id}`);
  }

  // Today in park time. Fine here, since nothing is rendered in the browser.
  const today = new Date(Date.now() + PARK_OFFSET_MS).toISOString().slice(0, 10);
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

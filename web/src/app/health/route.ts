import { connection } from "next/server";
import { databaseState } from "@/lib/health";
import { publicClient } from "@/lib/supabase";

// For an uptime monitor, and for a quick look after a deploy (docs/deployment.md). It reads one
// species from species_public, which anyone can read already, and answers 200 when that works and
// 503 when it doesn't. The site is public, so why it failed only goes to the server log.
const TIME_LIMIT_MS = 5000;

export async function GET() {
  await connection();
  const client = await publicClient();
  let error: { code?: string } | null = null;
  if (client) {
    try {
      ({ error } = await client
        .from("species_public")
        .select("slug")
        .limit(1)
        .abortSignal(AbortSignal.timeout(TIME_LIMIT_MS)));
    } catch {
      error = { code: "no answer" };
    }
  }
  const state = databaseState(Boolean(client), error);
  if (state !== "ok") {
    console.error(`Health check failed: the database is ${state}`, error?.code ?? "");
  }
  return Response.json(
    { status: state === "ok" ? "ok" : "down", checkedAt: new Date().toISOString() },
    { status: state === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

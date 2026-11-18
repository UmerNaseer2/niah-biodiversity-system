import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { refuse, refuseUnlessStaff } from "../src/lib/staff-download.ts";

const web = new URL("../", import.meta.url);

test("a staff session can download", () => {
  const session = { status: "ok", id: "1", email: "a@b.c", name: "Officer", role: "admin" };
  assert.equal(refuseUnlessStaff(session, "reports"), null);
});

test("an account that isn't staff gets a 403 that says who can download", async () => {
  const answer = refuseUnlessStaff(
    { status: "no-access", email: "v@b.c", role: "botanist" },
    "reports",
  );
  assert.equal(answer.status, 403);
  assert.equal(
    await answer.text(),
    "Only conservation officers and administrators can download reports.",
  );
  assert.equal(answer.headers.get("Cache-Control"), "no-store");
});

test("a signed out session gets the same 403 and never a 401", () => {
  // The proxy sends signed out requests to the sign in page first, so this
  // only happens if something gets past it
  const answer = refuseUnlessStaff({ status: "signed-out" }, "ecological data");
  assert.equal(answer.status, 403);
});

test("when the database isn't answering the download says so with a 503", async () => {
  const answer = refuseUnlessStaff({ status: "unavailable" }, "reports");
  assert.equal(answer.status, 503);
  assert.match(await answer.text(), /isn’t answering/);
});

test("refuse gives plain text", async () => {
  const answer = refuse(500, "The records didn’t load.");
  assert.equal(answer.status, 500);
  assert.equal(answer.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.equal(await answer.text(), "The records didn’t load.");
});

test("the proxy covers both CSV routes, so signed out requests go to sign in", () => {
  const proxy = readFileSync(new URL("src/proxy.ts", web), "utf8");
  assert.match(proxy, /matcher: \["\/dashboard\/:path\*"\]/);
  assert.match(proxy, /return updateSession\(request\)/);
  const session = readFileSync(new URL("src/lib/supabase/proxy.ts", web), "utf8");
  assert.match(session, /if \(!user && !authIsDown\(error\)\) return redirectToLogin\(request\)/);
  for (const route of ["reports", "ecology"]) {
    assert.ok(
      existsSync(new URL(`src/app/dashboard/${route}/csv/route.ts`, web)),
      `${route} CSV route moved out of /dashboard`,
    );
  }
});

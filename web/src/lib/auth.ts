import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { authConfigured } from "@/lib/supabase/config";
import { authIsDown } from "@/lib/supabase/outage";
import { DB_ROLE_LABEL, type DbRole } from "./roles";

export { DB_ROLE_LABEL, type DbRole };

// Only these roles may open the web dashboard.
export const DASHBOARD_ROLES: DbRole[] = ["conservation_officer", "admin"];

export type SessionResult =
  | { status: "signed-out" }
  // Supabase didn't answer, so we can't tell who this is
  | { status: "unavailable" }
  | { status: "no-access"; email: string; role: DbRole | null }
  | { status: "ok"; id: string; email: string; name: string; role: DbRole };

const CANT_CHECK = "Supabase didn’t answer, so nobody's session could be checked";

/** What a server action says when the session is "unavailable" */
export const SERVICE_DOWN =
  "The database isn’t answering, so nothing was changed. Try again in a minute.";

/** Who is signed in, and are they allowed on the dashboard? Memoised for one
 *  render. Call this in server code that shows staff data, not just in the
 *  proxy. */
export const getSession = cache(async (): Promise<SessionResult> => {
  if (!authConfigured) return { status: "signed-out" };

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user) {
    if (!authIsDown(error)) return { status: "signed-out" };
    console.error("Checking who is signed in failed:", error?.status, error?.message);
    return { status: "unavailable" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Loading the signed in profile failed:", profileError.message);
    return { status: "unavailable" };
  }

  const email = user.email ?? "";
  const role = (profile?.role as DbRole | undefined) ?? null;

  if (!role || !DASHBOARD_ROLES.includes(role)) {
    return { status: "no-access", email, role };
  }
  return {
    status: "ok",
    id: user.id,
    email,
    name: profile?.name || email,
    role,
  };
});

/**
 * For dashboard pages. The layout checks the session too, but Next renders a
 * page and its layout at the same time, so a page can't count on the layout's
 * check before it loads staff data. Sends anyone signed out to the sign in
 * page, and gives null for an account without dashboard access (the layout
 * shows them the no access page instead), so the page shows nothing. Throws in
 * an outage, so the error screen says it's on our side.
 */
export async function requireStaff() {
  const session = await getSession();
  if (session.status === "signed-out") redirect("/login");
  if (session.status === "unavailable") throw new Error(CANT_CHECK);
  return session.status === "ok" ? session : null;
}

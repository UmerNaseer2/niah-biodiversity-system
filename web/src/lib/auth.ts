import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { authConfigured } from "@/lib/supabase/config";

// Roles from the profiles table (supabase/001_initial_schema.sql, and
// researcher from supabase/006_role_based_access.sql, item 4).
export type DbRole =
  | "visitor"
  | "researcher"
  | "botanist"
  | "conservation_officer"
  | "admin";

export const DB_ROLE_LABEL: Record<DbRole, string> = {
  visitor: "Visitor",
  researcher: "Researcher",
  botanist: "Botanist",
  conservation_officer: "Conservation officer",
  admin: "Administrator",
};

// Only these roles may open the web dashboard.
export const DASHBOARD_ROLES: DbRole[] = ["conservation_officer", "admin"];

export type SessionResult =
  | { status: "signed-out" }
  | { status: "no-access"; email: string; role: DbRole | null }
  | { status: "ok"; id: string; email: string; name: string; role: DbRole };

/** Who is signed in, and are they allowed on the dashboard? Memoised for one
 *  render. Call this in server code that shows staff data, not just in the
 *  proxy. */
export const getSession = cache(async (): Promise<SessionResult> => {
  if (!authConfigured) return { status: "signed-out" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "signed-out" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .maybeSingle();

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

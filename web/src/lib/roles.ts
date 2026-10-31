// Roles from the profiles table (supabase/001_initial_schema.sql, and
// researcher from supabase/006_role_based_access.sql, item 4). There's nothing
// from the server in this file, so pages in the browser can use it too.
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

/** Everything someone's role can be changed to, lowest first */
export const ALL_ROLES: DbRole[] = [
  "visitor",
  "researcher",
  "botanist",
  "conservation_officer",
  "admin",
];

/** What someone can be invited as. Nobody needs an invite to be a visitor. */
export const INVITE_ROLES: DbRole[] = [
  "botanist",
  "conservation_officer",
  "researcher",
  "admin",
];

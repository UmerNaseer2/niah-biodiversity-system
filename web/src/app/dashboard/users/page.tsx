import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import { formatDateTime, parkTime } from "@/lib/format";
import { sqlIsMissing } from "@/lib/iot-db";
import { DB_ROLE_LABEL, type DbRole } from "@/lib/roles";
import { adminConfigured, authWithServiceKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountState } from "@/lib/users";
import { People, type Person } from "./people";
import {
  ROLE_CHANGES_SHOWN,
  RoleChanges,
  type RoleChangeList,
} from "./role-changes";

export const metadata: Metadata = { title: "Users and roles" };

const ROLES: DbRole[] = ["researcher", "botanist", "conservation_officer", "admin"];

// What each role can do. These match the Row Level Security rules in
// supabase/006_role_based_access.sql (item 4), so the database checks them
// itself and not only the website.

const PERMISSIONS: { label: string; roles: DbRole[] }[] = [
  {
    label: "Record plants in the mobile app",
    roles: ["botanist", "conservation_officer", "admin"],
  },
  {
    label: "Fix their own records while they wait for review",
    roles: ["botanist", "conservation_officer", "admin"],
  },
  {
    label: "See exact spots in the records they uploaded",
    roles: ["botanist", "conservation_officer", "admin"],
  },
  { label: "Add, edit and delete species", roles: ["conservation_officer", "admin"] },
  { label: "Approve, reject or delete records", roles: ["conservation_officer", "admin"] },
  {
    label: "See exact spots of every record, threatened plants too",
    roles: ["conservation_officer", "admin"],
  },
  { label: "Download reports", roles: ["conservation_officer", "admin"] },
  { label: "See sensor readings and alerts", roles: ["conservation_officer", "admin"] },
  { label: "Manage users and roles", roles: ["admin"] },
  { label: "See who downloaded exact spots", roles: ["admin"] },
];

/**
 * Everyone with an account. Names, emails and roles come through Row Level
 * Security as the administrator signed in. Whether they can sign in comes from
 * Supabase Auth, which needs the service role key, so the page still works
 * without it and just says what's missing.
 */
async function loadPeople(you: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role")
    .order("name");
  if (error) {
    console.error("Loading the people list failed:", error.code, error.message);
    return { people: null, accountsKnown: false };
  }

  const auth = authWithServiceKey();
  const listed = auth
    ? await auth.admin.listUsers({ page: 1, perPage: 1000 })
    : null;
  if (listed?.error) {
    console.error("Listing accounts failed:", listed.error.code, listed.error.status);
  }
  const accounts = listed?.error ? null : (listed?.data.users ?? null);
  const byId = new Map(accounts?.map((account) => [account.id, account]));

  const people: Person[] = data.map((profile) => {
    const account = byId.get(profile.id);
    return {
      id: profile.id,
      name: profile.name || profile.email || "No name",
      email: profile.email ?? account?.email ?? "",
      role: profile.role as DbRole,
      state: account ? accountState(account) : null,
      lastSignIn: account?.last_sign_in_at
        ? formatDateTime(parkTime(account.last_sign_in_at))
        : null,
      you: profile.id === you,
    };
  });

  // An account with no profile can sign in but has no role, so it's worth seeing
  const withProfile = new Set(data.map((profile) => profile.id));
  for (const account of accounts ?? []) {
    if (withProfile.has(account.id)) continue;
    people.push({
      id: account.id,
      name: account.email ?? "No name",
      email: account.email ?? "",
      role: null,
      state: accountState(account),
      lastSignIn: account.last_sign_in_at
        ? formatDateTime(parkTime(account.last_sign_in_at))
        : null,
      you: false,
    });
  }
  return { people, accountsKnown: accounts !== null };
}

/** The newest role changes, read as the admin signed in (supabase/021) */
async function loadRoleChanges(): Promise<RoleChangeList> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_changes")
    .select("id, changed_at, user_name, user_email, old_role, new_role, changed_by_name")
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ROLE_CHANGES_SHOWN);
  if (sqlIsMissing(error)) return { status: "not-set-up" };
  if (error) {
    console.error("Loading the role changes failed:", error.message);
    return { status: "failed" };
  }
  return {
    status: "ok",
    changes: data.map((row) => ({
      id: Number(row.id),
      changedAt: parkTime(String(row.changed_at)),
      userName: String(row.user_name),
      userEmail: String(row.user_email),
      oldRole: String(row.old_role),
      newRole: row.new_role ? String(row.new_role) : null,
      changedBy: row.changed_by_name ? String(row.changed_by_name) : null,
    })),
  };
}

export default async function UsersPage() {
  const session = await requireStaff();
  if (!session) return null;

  const isAdmin = session.role === "admin";
  const [{ people, accountsKnown }, roleChanges] = await Promise.all([
    isAdmin ? loadPeople(session.id) : { people: null, accountsKnown: false },
    isAdmin ? loadRoleChanges() : null,
  ]);

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Admin"
        title="Users and roles"
        description={
          isAdmin
            ? "Everyone with an account. Field teams use the same accounts in the mobile app, and their role decides what they can see and change."
            : "What each role can do. Only administrators can see who has an account and change their role."
        }
      />

      {isAdmin &&
        (people ? (
          <People
            people={people}
            canManageAccounts={adminConfigured && accountsKnown}
          />
        ) : (
          <p
            role="alert"
            className="flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
          >
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            The list of people didn’t load. Refresh the page, and if it keeps
            happening, check the database is up to date (supabase/README.md).
          </p>
        ))}

      {roleChanges && <RoleChanges list={roleChanges} />}

      <section aria-labelledby="roles-heading">
        <h2 id="roles-heading" className="text-xl font-bold tracking-tight">
          What each role can do
        </h2>
        <p className="max-w-2xl text-moss">
          Visitors without an account only get the public site, where
          threatened and protected plants show as a rough area. Researchers
          see the same as the public for now, until SFC decides what else
          they can see.
        </p>
        <div
          role="region"
          aria-labelledby="roles-heading"
          tabIndex={0}
          className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-sheet"
        >
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line bg-paper/60 text-moss">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-bold">
                  Permission
                </th>
                {ROLES.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className="w-28 px-3 py-2.5 text-center font-bold"
                  >
                    {DB_ROLE_LABEL[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PERMISSIONS.map((permission) => (
                <tr key={permission.label}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    {permission.label}
                  </th>
                  {ROLES.map((role) =>
                    permission.roles.includes(role) ? (
                      <td key={role} className="px-3 py-3">
                        <Icon name="check" className="mx-auto size-5 text-ok" />
                        <span className="sr-only">Yes</span>
                      </td>
                    ) : (
                      <td key={role} className="px-3 py-3">
                        <Icon name="x" className="mx-auto size-4 text-pencil" />
                        <span className="sr-only">No</span>
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex max-w-2xl items-start gap-3 rounded-xl border border-line bg-sheet p-4 sm:p-5">
          <Icon name="info" className="mt-0.5 size-5 text-forest" />
          <div>
            <h3 className="font-bold">
              Why can administrators do everything officers can?
            </h3>
            <p className="mt-1 text-sm text-moss">
              Our proposal has administrators looking after the accounts and
              the stored ecological data, so they can do everything an officer
              can as well. Botanists only see exact spots in the records they
              uploaded, because the fewer people who can see where a threatened
              plant is, the fewer ways that location can leak. The database
              checks these rules itself, so they still hold if someone skips
              the website and calls the API directly.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

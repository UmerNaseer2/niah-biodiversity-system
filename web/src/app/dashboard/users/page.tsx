import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { PlannedTape } from "@/components/tape";
import { people, ROLE_LABEL, type Role } from "@/data/people";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Users and roles" };

const ROLES: Role[] = ["researcher", "botanist", "officer", "admin"];

// What each role can do. These match the Row Level Security rules in
// supabase/006_role_based_access.sql (item 4), so the database checks them
// itself and not only the website.
const PERMISSIONS: { label: string; roles: Role[] }[] = [
  {
    label: "Record plants in the mobile app",
    roles: ["botanist", "officer", "admin"],
  },
  {
    label: "Fix their own records while they wait for review",
    roles: ["botanist", "officer", "admin"],
  },
  {
    label: "See exact spots in the records they uploaded",
    roles: ["botanist", "officer", "admin"],
  },
  { label: "Add, edit and delete species", roles: ["officer", "admin"] },
  { label: "Approve, reject or delete records", roles: ["officer", "admin"] },
  {
    label: "See exact spots of every record, threatened plants too",
    roles: ["officer", "admin"],
  },
  { label: "Download reports", roles: ["officer", "admin"] },
  { label: "See sensor readings and alerts", roles: ["officer", "admin"] },
  { label: "Manage users and roles", roles: ["admin"] },
];

export default async function UsersPage() {
  if (!(await requireStaff())) return null;

  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  const activeCount = people.filter((p) => p.active).length;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Admin"
        title="Users and roles"
        description="Everyone who can sign in to the staff side. Field teams use the same accounts in the mobile app, and their role decides what they can see and change."
        aside={
          <>
            <PlannedTape items={[2]} />
            <button type="button" disabled className="btn btn-primary">
              <Icon name="plus" className="size-4" />
              Invite someone
            </button>
          </>
        }
      />

      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="text-xl font-bold tracking-tight">
          People{" "}
          <span className="font-normal text-moss">
            ({activeCount} active)
          </span>
        </h2>
        <p className="max-w-2xl text-moss">
          These accounts are made up. Listing the real ones, inviting people
          and changing roles are part of item 2.
        </p>
        <div
          role="region"
          aria-labelledby="people-heading"
          tabIndex={0}
          className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-sheet"
        >
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line bg-paper/60 text-moss">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-bold">Name</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Role</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Account</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((person) => (
                <tr key={person.id}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <span className="font-bold">{person.name}</span>
                    <span className="block font-mono text-xs text-moss">
                      {person.email}
                    </span>
                  </th>
                  <td className="px-4 py-3">{ROLE_LABEL[person.role]}</td>
                  <td className="px-4 py-3">
                    {person.active ? (
                      <span className="inline-flex items-center gap-1.5 font-bold text-ok">
                        <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-moss">
                        <span className="size-2 rounded-full border border-pencil" aria-hidden="true" />
                        Deactivated
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDateTime(person.lastActive)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
                    {ROLE_LABEL[role]}
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

import { Icon } from "@/components/icon";
import { formatDate, formatTime } from "@/lib/format";
import { DB_ROLE_LABEL, type DbRole } from "@/lib/roles";

export type RoleChange = {
  id: number;
  /** Park time, like 2026-10-30T09:15 */
  changedAt: string;
  userName: string;
  userEmail: string;
  oldRole: string;
  /** Empty when the account was deleted */
  newRole: string | null;
  /** Empty when nobody was signed in, like a change in the SQL editor */
  changedBy: string | null;
};

export type RoleChangeList =
  | { status: "ok"; changes: RoleChange[] }
  | { status: "not-set-up" }
  | { status: "failed" };

/** How many it shows. The rest are in the role_changes table. */
export const ROLE_CHANGES_SHOWN = 20;

function roleName(role: string) {
  return DB_ROLE_LABEL[role as DbRole] ?? role;
}

/**
 * The newest role changes, for admins only. The database writes these itself
 * and nobody can change them through the website (supabase/021).
 */
export function RoleChanges({ list }: { list: RoleChangeList }) {
  return (
    <section aria-labelledby="role-changes-heading">
      <h2 id="role-changes-heading" className="text-xl font-bold tracking-tight">
        Recent role changes
      </h2>
      <p className="max-w-2xl text-moss">
        Who changed whose role, newest first, up to the last {ROLE_CHANGES_SHOWN}.
        Only administrators see this list, and nobody can change it.
      </p>

      {list.status === "not-set-up" ? (
        <p className="mt-4 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          Role changes aren’t being written down yet, because
          021_role_changes.sql hasn’t been run on this database
          (supabase/README.md).
        </p>
      ) : list.status === "failed" ? (
        <p className="mt-4 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          The list didn’t load. Refresh the page to try again.
        </p>
      ) : list.changes.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-pencil bg-sheet p-6 text-center text-moss">
          Nobody’s role has changed since this list started.
        </p>
      ) : (
        <div
          role="region"
          aria-labelledby="role-changes-heading"
          tabIndex={0}
          className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-sheet"
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
                  Change
                </th>
                <th scope="col" className="px-4 py-2.5 font-bold">
                  Changed by
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.changes.map((change) => (
                <tr key={change.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDate(change.changedAt)}, {formatTime(change.changedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-bold">
                      {change.userName || change.userEmail}
                    </span>
                    {change.userName && (
                      <span className="block text-moss">{change.userEmail}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {roleName(change.oldRole)} to{" "}
                    {change.newRole ? roleName(change.newRole) : "account deleted"}
                  </td>
                  <td className="px-4 py-3">
                    {change.changedBy ?? (
                      <span className="text-moss">
                        Someone in Supabase, not this site
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

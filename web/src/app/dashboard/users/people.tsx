"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import {
  ALL_ROLES,
  DB_ROLE_LABEL,
  INVITE_ROLES,
  type DbRole,
} from "@/lib/roles";
import { checkInvite, type AccountState } from "@/lib/users";
import {
  changeRole,
  inviteUser,
  sendPasswordLink,
  setAccountActive,
  type UsersResult,
} from "./actions";

export type Person = {
  id: string;
  name: string;
  email: string;
  /** null when they can sign in but have no row in profiles */
  role: DbRole | null;
  /** null when the server can't ask Supabase Auth */
  state: AccountState | null;
  lastSignIn: string | null;
  you: boolean;
};

const STATE_LABEL: Record<AccountState, string> = {
  active: "Active",
  invited: "Invited",
  deactivated: "Deactivated",
};

const STATE_STYLE: Record<AccountState, string> = {
  active: "bg-ok-soft text-ok",
  invited: "bg-paper text-moss",
  deactivated: "bg-bad-soft text-bad",
};

/** Asks the server, and gives a message if the request itself fails */
function ask(request: Promise<UsersResult>): Promise<UsersResult> {
  return request.catch(() => ({
    ok: false,
    message: "The server didn’t answer, so nothing changed. Check your connection and try again.",
  }));
}

/** Moves the keyboard focus after what was focused has gone from the page */
function useFocusRequest() {
  const [request, setRequest] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (request) document.getElementById(request.id)?.focus();
  }, [request]);
  return (id: string) => setRequest({ id });
}

export function People({
  people,
  canManageAccounts,
}: {
  people: Person[];
  canManageAccounts: boolean;
}) {
  const [announcement, setAnnouncement] = useState("");

  return (
    <div className="space-y-10">
      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="text-xl font-bold tracking-tight">
          People
        </h2>
        <p className="sr-only" role="status">
          {announcement}
        </p>

        {!canManageAccounts && (
          <p className="mt-3 flex max-w-2xl gap-2.5 rounded-xl border border-line bg-sheet p-4 text-sm text-moss">
            <Icon name="info" className="mt-0.5 size-4 shrink-0 text-forest" />
            <span>
              You can change roles here, but invites, deactivating and the last
              sign in need Supabase’s service role key on the server, and this
              server can’t use it yet (web/README.md).
            </span>
          </p>
        )}

        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-sheet">
          {people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              onResult={setAnnouncement}
            />
          ))}
        </ul>
      </section>

      <InviteForm canInvite={canManageAccounts} onResult={setAnnouncement} />
    </div>
  );
}

function PersonRow({
  person,
  onResult,
}: {
  person: Person;
  onResult: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UsersResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const focusOn = useFocusRequest();
  const nameId = `person-${person.id}`;

  function run(request: () => Promise<UsersResult>) {
    setResult(null);
    startTransition(async () => {
      const answer = await ask(request());
      setResult(answer);
      setConfirming(false);
      onResult(answer.message);
      focusOn(nameId);
    });
  }

  const deactivated = person.state === "deactivated";

  return (
    <li className="grid gap-4 p-4 sm:grid-cols-2 sm:items-start xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p
          id={nameId}
          tabIndex={-1}
          className="font-bold break-words outline-none"
        >
          {person.name}
          {person.you && (
            <span className="ml-2 text-sm font-normal text-moss">(you)</span>
          )}
        </p>
        <p className="text-sm break-words text-moss">{person.email}</p>
      </div>

      <div>
        {person.you || person.role === null || deactivated ? (
          <p className="text-sm">
            <span className="font-bold">
              {person.role ? DB_ROLE_LABEL[person.role] : "No profile"}
            </span>
            {person.you && (
              <span className="block text-moss">
                Another administrator has to change this.
              </span>
            )}
            {deactivated && (
              <span className="block text-moss">
                Reactivate them to choose a role.
              </span>
            )}
          </p>
        ) : (
          // Starts again from the saved role whenever the server sends a new one
          <RoleChooser
            key={person.role}
            person={person}
            role={person.role}
            pending={pending}
            run={run}
          />
        )}
      </div>

      <div className="text-sm">
        {person.state ? (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE_STYLE[person.state]}`}
          >
            {STATE_LABEL[person.state]}
          </span>
        ) : null}
        {person.state && (
          <p className="mt-1 text-moss">
            Last signed in: {person.lastSignIn ?? "Never"}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 xl:justify-end">
        {person.state && !person.you && confirming && (
          <>
            <p className="w-full text-sm font-bold text-bad xl:text-right">
              Deactivate {person.name}? They lose access now.
            </p>
            <button
              type="button"
              id={`${nameId}-confirm`}
              disabled={pending}
              className="btn btn-danger"
              onClick={() =>
                run(() => setAccountActive({ id: person.id, active: false }))
              }
            >
              {pending ? "Deactivating…" : "Deactivate"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="btn btn-secondary"
              onClick={() => {
                setConfirming(false);
                focusOn(`${nameId}-deactivate`);
              }}
            >
              Keep account
            </button>
          </>
        )}
        {person.state && !person.you && !confirming && deactivated && (
          <button
            type="button"
            disabled={pending}
            className="btn btn-secondary"
            onClick={() =>
              run(() => setAccountActive({ id: person.id, active: true }))
            }
          >
            {pending ? "Reactivating…" : "Reactivate"}
          </button>
        )}
        {person.state && !person.you && !confirming && !deactivated && (
          <>
            {/* Someone still invited needs the invite again, not this */}
            {person.state === "active" && (
              <button
                type="button"
                disabled={pending}
                className="btn btn-secondary"
                onClick={() => run(() => sendPasswordLink(person.email))}
              >
                Send password link
              </button>
            )}
            <button
              type="button"
              id={`${nameId}-deactivate`}
              disabled={pending}
              className="btn btn-secondary"
              onClick={() => {
                setResult(null);
                setConfirming(true);
                focusOn(`${nameId}-confirm`);
              }}
            >
              Deactivate
            </button>
          </>
        )}
      </div>

      {result && (
        <p
          className={`flex items-start gap-2 text-sm font-bold sm:col-span-2 xl:col-span-4 ${result.ok ? "text-ok" : "text-bad"}`}
        >
          <Icon
            name={result.ok ? "check" : "info"}
            className="mt-0.5 size-4 shrink-0"
          />
          {result.message}
        </p>
      )}
    </li>
  );
}

function RoleChooser({
  person,
  role,
  pending,
  run,
}: {
  person: Person;
  role: DbRole;
  pending: boolean;
  run: (request: () => Promise<UsersResult>) => void;
}) {
  const [chosen, setChosen] = useState(role);
  const id = useId();
  const changed = chosen !== role;
  const toAdmin = chosen === "admin";

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Role of {person.name}
      </label>
      <select
        id={id}
        value={chosen}
        disabled={pending}
        onChange={(event) => setChosen(event.target.value as DbRole)}
        className="field w-full"
      >
        {ALL_ROLES.map((option) => (
          <option key={option} value={option}>
            {DB_ROLE_LABEL[option]}
          </option>
        ))}
      </select>

      {changed && (
        <div className="mt-2">
          {toAdmin && (
            <p className="mb-2 text-sm font-bold text-bad">
              Administrators can manage every account and see every exact spot.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className={toAdmin ? "btn btn-danger" : "btn btn-primary"}
              onClick={() =>
                run(() => changeRole({ id: person.id, from: role, to: chosen }))
              }
            >
              {pending
                ? "Saving…"
                : toAdmin
                  ? "Make administrator"
                  : `Make ${DB_ROLE_LABEL[chosen].toLowerCase()}`}
            </button>
            <button
              type="button"
              disabled={pending}
              className="btn btn-secondary"
              onClick={() => setChosen(role)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteForm({
  canInvite,
  onResult,
}: {
  canInvite: boolean;
  onResult: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<DbRole>("botanist");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UsersResult | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const checked = checkInvite({ email, name, role });
    if (!checked.ok) {
      setResult({ ok: false, message: checked.message });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const answer = await ask(inviteUser(checked.value));
      setResult(answer);
      onResult(answer.message);
      if (answer.ok) {
        setEmail("");
        setName("");
      }
    });
  }

  return (
    <section aria-labelledby="invite-heading">
      <h2 id="invite-heading" className="text-xl font-bold tracking-tight">
        Invite someone
      </h2>
      <p className="max-w-2xl text-moss">
        They get an email with a link to set a password. To send it again,
        invite the same email.
      </p>

      <form
        onSubmit={submit}
        noValidate
        className="mt-4 grid max-w-2xl gap-4 rounded-xl border border-line bg-sheet p-4 sm:grid-cols-2 sm:p-5"
      >
        <div>
          <label htmlFor="invite-email" className="text-sm font-bold">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            disabled={!canInvite}
            onChange={(event) => setEmail(event.target.value)}
            className="field mt-1.5 w-full"
          />
        </div>
        <div>
          <label htmlFor="invite-name" className="text-sm font-bold">
            Name
          </label>
          <input
            id="invite-name"
            type="text"
            autoComplete="off"
            value={name}
            disabled={!canInvite}
            onChange={(event) => setName(event.target.value)}
            className="field mt-1.5 w-full"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="text-sm font-bold">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            disabled={!canInvite}
            onChange={(event) => setRole(event.target.value as DbRole)}
            className="field mt-1.5 w-full"
          >
            {INVITE_ROLES.map((option) => (
              <option key={option} value={option}>
                {DB_ROLE_LABEL[option]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={!canInvite || pending}
            className={role === "admin" ? "btn btn-danger" : "btn btn-primary"}
          >
            <Icon name="plus" className="size-4" />
            {pending
              ? "Sending…"
              : role === "admin"
                ? "Invite as administrator"
                : "Send invite"}
          </button>
        </div>

        {role === "admin" && (
          <p className="text-sm font-bold text-bad sm:col-span-2">
            Administrators can manage every account and see every exact spot.
          </p>
        )}

        {result && (
          <p
            role={result.ok ? undefined : "alert"}
            className={`flex items-start gap-2 text-sm font-bold sm:col-span-2 ${result.ok ? "text-ok" : "text-bad"}`}
          >
            <Icon
              name={result.ok ? "check" : "info"}
              className="mt-0.5 size-4 shrink-0"
            />
            {result.message}
          </p>
        )}
      </form>
    </section>
  );
}

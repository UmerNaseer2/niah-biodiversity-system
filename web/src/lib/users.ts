import { RECORD_ID } from "./record-form";
import { ALL_ROLES, INVITE_ROLES, type DbRole } from "./roles";

// The users page (web/src/app/dashboard/users) and the page for setting a
// password (web/src/app/(public)/welcome). The pages check these before they
// ask the server, and the server actions run them again, because anyone can
// send a request straight to a server action.

export const MAX_NAME = 100;
export const MAX_EMAIL = 254;
/** Supabase asks for 6 by default. These accounts can reach protected data, so we ask for more. */
export const MIN_PASSWORD = 10;
/** Supabase's sign in only reads the first 72 bytes, so a longer one isn't really longer */
export const MAX_PASSWORD = 72;

type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRole(role: unknown, allowed: DbRole[]): role is DbRole {
  return allowed.includes(role as DbRole);
}

function emailProblem(email: string) {
  if (!email) return "Enter their email.";
  if (email.length > MAX_EMAIL || !EMAIL.test(email)) return "That doesn’t look like an email.";
  return null;
}

export type InviteInput = { email: string; name: string; role: DbRole };

export function checkInvite(input: unknown): Checked<InviteInput> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const name = typeof raw.name === "string" ? raw.name.trim().replace(/\s+/g, " ") : "";

  const problem = emailProblem(email);
  if (problem) return { ok: false, message: problem };
  if (!name) return { ok: false, message: "Enter their name." };
  if (name.length > MAX_NAME) {
    return { ok: false, message: `The name can be up to ${MAX_NAME} characters.` };
  }
  if (!isRole(raw.role, INVITE_ROLES)) {
    return { ok: false, message: "Choose the role they’ll have." };
  }
  return { ok: true, value: { email, name, role: raw.role } };
}

export type RoleChangeInput = { id: string; from: DbRole; to: DbRole };

export function checkRoleChange(input: unknown): Checked<RoleChangeInput> {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.id !== "string" || !RECORD_ID.test(raw.id)) {
    return { ok: false, message: "This isn’t an account the database knows." };
  }
  if (!isRole(raw.from, ALL_ROLES) || !isRole(raw.to, ALL_ROLES)) {
    return { ok: false, message: "That isn’t a role the database knows." };
  }
  if (raw.from === raw.to) return { ok: false, message: "That’s already their role." };
  return { ok: true, value: { id: raw.id, from: raw.from, to: raw.to } };
}

export type AccountChangeInput = { id: string; active: boolean };

export function checkAccountChange(input: unknown): Checked<AccountChangeInput> {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.id !== "string" || !RECORD_ID.test(raw.id)) {
    return { ok: false, message: "This isn’t an account the database knows." };
  }
  if (typeof raw.active !== "boolean") {
    return { ok: false, message: "Reload the page, then try again." };
  }
  return { ok: true, value: { id: raw.id, active: raw.active } };
}

export function checkEmail(input: unknown): Checked<string> {
  const email = typeof input === "string" ? input.trim().toLowerCase() : "";
  const problem = emailProblem(email);
  return problem ? { ok: false, message: problem } : { ok: true, value: email };
}

/** Gives the reason a new password is no good, or null */
export function passwordProblem(password: string, again: string) {
  if (password.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters.`;
  }
  // Counted in bytes, because a letter with an accent or an emoji takes more than one
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) {
    return `Use up to ${MAX_PASSWORD} characters.`;
  }
  if (password !== again) return "The two passwords aren’t the same.";
  return null;
}

/** What Supabase Auth says about an account, in words for the page */
export type AccountState = "active" | "invited" | "deactivated";

/** Works out an account's state from what Supabase Auth says about it */
export function accountState(user: {
  banned_until?: string | null;
  email_confirmed_at?: string | null;
}, now = Date.now()): AccountState {
  if (user.banned_until && Date.parse(user.banned_until) > now) return "deactivated";
  return user.email_confirmed_at ? "active" : "invited";
}

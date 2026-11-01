"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSession, SERVICE_DOWN } from "@/lib/auth";
import { DB_ROLE_LABEL, type DbRole } from "@/lib/roles";
import { authWithServiceKey } from "@/lib/supabase/admin";
import { authConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  checkAccountChange,
  checkEmail,
  checkInvite,
  checkRoleChange,
} from "@/lib/users";

export type UsersResult = { ok: boolean; message: string };

/** Why the database refused a role change, or null if something else failed */
function whyRoleRefused(error: { code?: string }) {
  if (error.code === "42501") {
    return "The database didn’t let your account change this role. Reload the page to check you’re still an administrator.";
  }
  // keep_one_admin, when another administrator took a role away at that moment
  if (error.code === "P0001") {
    return "That would leave nobody as an administrator, so nothing was changed.";
  }
  return null;
}

const TRY_AGAIN = "Nothing was changed. Try again, and if it keeps happening, check the server’s logs.";
const NEEDS_KEY =
  "This server doesn’t have Supabase’s service role key, so it can’t do this yet (web/README.md).";

/**
 * Anyone can send a request straight to a server action, so this checks who is
 * signed in itself. Row Level Security checks the role changes again
 * (supabase/006). Gives the admin's ID, or the reason they can't.
 */
async function adminOnly(): Promise<{ id: string } | { message: string }> {
  if (!authConfigured) return { message: "Managing accounts isn’t set up on this server yet." };
  const session = await getSession();
  if (session.status === "signed-out") {
    return { message: "You’re signed out. Sign in again, then try that again." };
  }
  if (session.status === "unavailable") return { message: SERVICE_DOWN };
  if (session.status !== "ok" || session.role !== "admin") {
    return { message: "Only administrators can manage accounts." };
  }
  return { id: session.id };
}

/** Where the link in an invite comes back to. Supabase's allow list checks it again. */
async function welcomeLink() {
  const sent = await headers();
  const origin = sent.get("origin");
  return origin ? `${origin}/welcome` : undefined;
}

function whyEmailFailed(error: { code?: string; status?: number; message: string }) {
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return "That email already has an account, so it can’t be invited. Change their role in the list above, or send them a password link.";
  }
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "Supabase has sent too many emails for now. Wait a while, then try again.";
  }
  console.error("Sending an account email failed:", error.code, error.status);
  return "The email didn’t send. Try again, and if it keeps happening, check the server’s logs.";
}

/**
 * Changes someone's role. It only goes through if they still have the role the
 * page showed, so two administrators can't overwrite each other. Runs as the
 * person signed in, not with the service key, so the database decides.
 */
export async function changeRole(input: unknown): Promise<UsersResult> {
  const admin = await adminOnly();
  if ("message" in admin) return { ok: false, message: admin.message };

  const checked = checkRoleChange(input);
  if (!checked.ok) return checked;
  const { id, from, to } = checked.value;
  // The database makes sure one administrator is always left (supabase/021)
  if (id === admin.id) {
    return {
      ok: false,
      message: "You can’t change your own role. Ask another administrator.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: to })
    .eq("id", id)
    .eq("role", from)
    .select("id");

  if (error) {
    const refused = whyRoleRefused(error);
    if (refused) return { ok: false, message: refused };
    console.error("Changing a role failed:", error.code, error.message);
    return { ok: false, message: TRY_AGAIN };
  }

  revalidatePath("/dashboard/users");
  if (data.length === 0) {
    const now = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
    if (!now.data) {
      return { ok: false, message: "This account isn’t in the database any more. Reload the page." };
    }
    return {
      ok: false,
      message: `Someone else changed this role. It’s now “${DB_ROLE_LABEL[now.data.role as DbRole]}”, so nothing was saved.`,
    };
  }
  return { ok: true, message: `Role changed to ${DB_ROLE_LABEL[to]}.` };
}

/**
 * Emails someone a link to set a password. Their account starts as a visitor
 * (the trigger in supabase/004), then their role is set the same way as any
 * other role change, so the service key never writes to a table.
 */
export async function inviteUser(input: unknown): Promise<UsersResult> {
  const admin = await adminOnly();
  if ("message" in admin) return { ok: false, message: admin.message };

  const checked = checkInvite(input);
  if (!checked.ok) return checked;
  const { email, name, role } = checked.value;

  const auth = authWithServiceKey();
  if (!auth) return { ok: false, message: NEEDS_KEY };

  const { data, error } = await auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: await welcomeLink(),
  });
  if (error) return { ok: false, message: whyEmailFailed(error) };

  const supabase = await createClient();
  const saved = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", data.user.id)
    .select("id");

  revalidatePath("/dashboard/users");
  if (saved.error || saved.data.length === 0) {
    if (saved.error) console.error("Setting an invited role failed:", saved.error.code, saved.error.message);
    return {
      ok: false,
      message: `The invite went to ${email}, but their role is still Visitor. Choose it in the list above.`,
    };
  }
  return { ok: true, message: `Invite sent to ${email}, as ${DB_ROLE_LABEL[role]}.` };
}

/**
 * Takes someone's access away, or lets them sign in again. A ban only stops new
 * sign ins, and a sign in they already have keeps working until it runs out, so
 * this takes their role first. That applies straight away in every request,
 * because Row Level Security reads the role each time.
 */
export async function setAccountActive(input: unknown): Promise<UsersResult> {
  const admin = await adminOnly();
  if ("message" in admin) return { ok: false, message: admin.message };

  const checked = checkAccountChange(input);
  if (!checked.ok) return checked;
  const { id, active } = checked.value;
  if (id === admin.id) {
    return { ok: false, message: "You can’t deactivate your own account." };
  }

  const auth = authWithServiceKey();
  if (!auth) return { ok: false, message: NEEDS_KEY };

  if (active) {
    const { error } = await auth.admin.updateUserById(id, { ban_duration: "none" });
    if (error) {
      console.error("Reactivating an account failed:", error.code, error.status);
      return { ok: false, message: TRY_AGAIN };
    }
    revalidatePath("/dashboard/users");
    return {
      ok: true,
      message: "Account reactivated. They can sign in, but their role is still Visitor until you choose one.",
    };
  }

  const supabase = await createClient();
  const demoted = await supabase
    .from("profiles")
    .update({ role: "visitor" })
    .eq("id", id)
    .select("id");
  if (demoted.error) {
    const refused = whyRoleRefused(demoted.error);
    if (refused) return { ok: false, message: refused };
    console.error("Removing a role failed:", demoted.error.code, demoted.error.message);
    return { ok: false, message: TRY_AGAIN };
  }
  if (demoted.data.length === 0) {
    // An account with no profile has no role to take away. One that has a
    // profile was refused, and a ban alone would leave its sign in with its role.
    const now = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
    if (now.error || now.data) {
      return { ok: false, message: TRY_AGAIN };
    }
  }

  revalidatePath("/dashboard/users");
  const { error } = await auth.admin.updateUserById(id, { ban_duration: "876000h" });
  if (error) {
    console.error("Deactivating an account failed:", error.code, error.status);
    return {
      ok: false,
      message: "Their role was removed, so they can’t see anything protected, but they can still sign in. Try again.",
    };
  }
  return { ok: true, message: "Account deactivated. They can’t sign in, and their role is now Visitor." };
}

/** Emails someone a link to set a new password, for one they've lost or never set */
export async function sendPasswordLink(input: unknown): Promise<UsersResult> {
  const admin = await adminOnly();
  if ("message" in admin) return { ok: false, message: admin.message };

  const checked = checkEmail(input);
  if (!checked.ok) return checked;

  const auth = authWithServiceKey();
  if (!auth) return { ok: false, message: NEEDS_KEY };

  const { error } = await auth.resetPasswordForEmail(checked.value, {
    redirectTo: await welcomeLink(),
  });
  if (error) return { ok: false, message: whyEmailFailed(error) };
  return { ok: true, message: `Password link sent to ${checked.value}.` };
}

"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { versionRange } from "@/lib/edit-version";
import { checkReview, DECISIONS, type Decision } from "@/lib/review";
import { STATUS_LABEL, type StaffStatus } from "@/lib/records-staff";
import { authConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ReviewResult =
  | { ok: true; status: StaffStatus }
  | { ok: false; message: string };

/**
 * Anyone can send a request straight to a server action, so this checks who
 * is signed in itself. Row Level Security and the review trigger in the
 * database check again (supabase/006). Gives the reason they can't, or null.
 */
async function whyNotAllowed() {
  if (!authConfigured) return "Reviewing records isn’t set up on this server yet.";
  const session = await getSession();
  if (session.status === "signed-out") {
    return "You’re signed out. Sign in again, then make your decision again.";
  }
  if (session.status === "no-access") {
    return "Only conservation officers and administrators can review records.";
  }
  return null;
}

/** The queue, the records pages and the public pages that show approved records */
function refreshAfterReview() {
  revalidatePath("/dashboard", "layout");
  // The public pages sit in the (public) route group, so the path names it
  revalidatePath("/(public)", "layout");
}

const DONE: Record<Decision, string> = {
  approve: "approve",
  reject: "reject",
  reopen: "send back to the queue",
};

/**
 * Approves, rejects or reopens one record. It only goes through if the record
 * is still in the status the page showed and nobody has saved it since, so
 * two officers can't decide on the same record, or review one that someone
 * has just edited.
 */
export async function reviewRecord(input: unknown): Promise<ReviewResult> {
  const notAllowed = await whyNotAllowed();
  if (notAllowed) return { ok: false, message: notAllowed };

  const checked = checkReview(input);
  if (!checked.ok) return { ok: false, message: checked.message };
  const { id, version, decision, reason } = checked.value;
  const { to, from } = DECISIONS[decision];

  const supabase = await createClient();
  const range = versionRange(version);
  // Approving clears an old rejection reason, so a record that was sent back
  // and then approved doesn't keep saying why it was rejected. Reopening keeps
  // the reason, so whoever looks at it next can see why it was rejected.
  const change =
    decision === "reject"
      ? { status: to, review_notes: reason }
      : decision === "approve"
        ? { status: to, review_notes: null }
        : { status: to };

  const { data, error } = await supabase
    .from("records")
    .update(change)
    .eq("id", id)
    .in("status", from)
    .gte("updated_at", range.from)
    .lt("updated_at", range.to)
    .select("status");

  if (error) {
    if (error.code === "42501") {
      return {
        ok: false,
        message:
          `The database didn’t let your account ${DONE[decision]} this record. ` +
          "Ask an administrator to check your role.",
      };
    }
    console.error(`Trying to ${DONE[decision]} a record failed:`, error.code, error.message);
    return {
      ok: false,
      message: "Nothing was saved. Try again, and if it keeps happening, ask an administrator.",
    };
  }

  if (data.length === 0) {
    // Nothing matched, so say why: it's gone, it was reviewed, or it was edited
    const now = await supabase.from("records_staff").select("status").eq("id", id).maybeSingle();
    if (!now.data) {
      return {
        ok: false,
        message:
          "This record isn’t in the database any more. Someone may have deleted it, " +
          "so reload the page.",
      };
    }
    const status = now.data.status as StaffStatus;
    if (!from.includes(status)) {
      return {
        ok: false,
        message:
          `Someone else already changed this record. It’s now “${STATUS_LABEL[status]}”, ` +
          "so nothing was saved. Reload the page to see it.",
      };
    }
    return {
      ok: false,
      message:
        "Someone saved changes to this record after you opened the page, so your " +
        "decision wasn’t saved. Reload the page to see what changed, then decide again.",
    };
  }

  refreshAfterReview();
  return { ok: true, status: data[0].status as StaffStatus };
}

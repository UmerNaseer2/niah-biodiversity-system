import { RECORD_ID } from "./record-form";

// The review queue (web/src/app/dashboard/review). The page checks these
// before it asks the server, and the server action runs them again, because
// anyone can send a request straight to a server action.

export type Decision = "approve" | "reject" | "reopen";

/** The longest reason, the same as the notes on a record */
export const MAX_REASON = 1000;

/** What a decision changes a record to, and what it has to be now for the decision to apply */
export const DECISIONS: Record<
  Decision,
  { to: "published" | "rejected" | "waiting"; from: ("waiting" | "published" | "rejected")[] }
> = {
  approve: { to: "published", from: ["waiting"] },
  reject: { to: "rejected", from: ["waiting"] },
  reopen: { to: "waiting", from: ["published", "rejected"] },
};

export type ReviewInput = {
  id: string;
  /** The updated_at the page loaded (src/lib/edit-version.ts) */
  version: string;
  decision: Decision;
  /** Why it was rejected. Only a rejection has one */
  reason: string;
};

export function tidyReason(reason: string) {
  return reason.trim().replace(/[ \t]+/g, " ");
}

/** What a rejection with no reason says, in the page and in the action */
export const REASON_MISSING = "Write a reason so the ranger knows what to fix.";

/** Checks what came from a form or a request. Gives the reason it's no good, or the input tidied up. */
export function checkReview(input: unknown): { ok: true; value: ReviewInput } | { ok: false; message: string } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : "";
  const version = typeof raw.version === "string" ? raw.version : "";
  const decision = raw.decision;
  const reason = typeof raw.reason === "string" ? tidyReason(raw.reason) : "";

  if (!RECORD_ID.test(id)) return { ok: false, message: "This isn’t a record the database knows." };
  if (decision !== "approve" && decision !== "reject" && decision !== "reopen") {
    return { ok: false, message: "That isn’t a decision the review queue knows." };
  }
  if (!version || Number.isNaN(Date.parse(version))) {
    return { ok: false, message: "Reload the page, then try again." };
  }
  if (decision === "reject") {
    if (!reason) return { ok: false, message: REASON_MISSING };
    if (reason.length > MAX_REASON) {
      return { ok: false, message: `The reason can be up to ${MAX_REASON} characters.` };
    }
  }
  return {
    ok: true,
    value: { id, version, decision, reason: decision === "reject" ? reason : "" },
  };
}

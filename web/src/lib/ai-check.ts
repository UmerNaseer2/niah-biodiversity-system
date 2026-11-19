/**
 * The AI photo check on the review queue (supabase/032_ai_photo_check.sql and the ai-check Edge
 * Function). Turns a record_ai_checks row into what the queue shows. This file has no imports, so
 * the client side and the tests can use it too.
 */

export type AiAnswer = "yes" | "no" | "unsure";
export type AiVerdict = "consistent" | "worth_a_look" | "unsure";
export type AiStatus =
  | "not_checked"
  | "waiting_for_photos"
  | "checking"
  | "done"
  | "failed"
  | "not_set_up";

export type AiCheck = {
  status: AiStatus;
  verdict: AiVerdict | null;
  namesMatch: AiAnswer | null;
  photoShowsPlant: AiAnswer | null;
  photoMatchesName: AiAnswer | null;
  note: string | null;
  problem: string | null;
  photosChecked: number;
  /** Someone changed the names after the check, so it was about the old ones */
  namesChanged: boolean;
  /** Sent more than STUCK_MS ago with no answer. The function gives up well before that */
  stuck: boolean;
  checkedAt: string | null;
};

/** The columns the page reads. Officers can't read the token (032) */
export const AI_CHECK_COLUMNS =
  "record_id, status, verdict, names_match, photo_shows_plant, photo_matches_name, note, " +
  "problem, photos_checked, checked_species_name, checked_common_name, requested_at, checked_at";

/** Same as request_ai_check() in 032, which lets an officer send a check again after this long */
export const STUCK_MS = 2 * 60 * 1000;

/** The same as cut() in the function, so a long name it shortened still counts as the same name */
const NAME_MAX = 200;
function cut(text: string, max: number) {
  const tidy = text.replace(/\s+/g, " ").trim();
  if (tidy.length <= max) return tidy;
  const short = tidy.slice(0, max - 3);
  const space = short.lastIndexOf(" ");
  return `${space > max * 0.6 ? short.slice(0, space) : short}...`;
}

function sameAsChecked(now: string | null, checked: unknown) {
  const current = now && now.trim() ? cut(now, NAME_MAX) : null;
  const then = typeof checked === "string" && checked ? checked : null;
  return current === then;
}

const STATUSES: AiStatus[] = ["waiting_for_photos", "checking", "done", "failed", "not_set_up"];
const VERDICTS: AiVerdict[] = ["consistent", "worth_a_look", "unsure"];
const ANSWERS: AiAnswer[] = ["yes", "no", "unsure"];

function pick<T extends string>(value: unknown, allowed: T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function time(value: unknown) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * What the queue shows for one record. With no row the record was sent before 032 went in (or
 * the trigger warned and moved on), so it says it hasn't been checked and offers the button.
 */
export function aiCheckFromRow(
  row: Record<string, unknown> | undefined,
  record: { speciesName: string; commonName: string | null },
  now: number,
  formatTime: (iso: string) => string,
): AiCheck {
  const status = row ? pick(row.status, STATUSES) ?? "not_checked" : "not_checked";
  const done = status === "done";
  const verdict = done ? pick(row?.verdict, VERDICTS) : null;
  const requested = time(row?.requested_at);
  const checkedAt = done || status === "failed" ? text(row?.checked_at) : null;
  return {
    status: done && !verdict ? "failed" : status,
    verdict,
    namesMatch: done ? pick(row?.names_match, ANSWERS) : null,
    photoShowsPlant: done ? pick(row?.photo_shows_plant, ANSWERS) : null,
    photoMatchesName: done ? pick(row?.photo_matches_name, ANSWERS) : null,
    note: done ? text(row?.note) : null,
    problem: status === "failed" || (done && !verdict) ? text(row?.problem) : null,
    photosChecked:
      done && typeof row?.photos_checked === "number" ? Math.max(0, row.photos_checked) : 0,
    namesChanged:
      done &&
      !(
        sameAsChecked(record.speciesName, row?.checked_species_name) &&
        sameAsChecked(record.commonName, row?.checked_common_name)
      ),
    stuck: status === "checking" && (requested === null || now - requested > STUCK_MS),
    checkedAt: checkedAt && time(checkedAt) !== null ? formatTime(checkedAt) : null,
  };
}

/** Whether the answer may still come in, so the page should look again soon */
export function aiCheckPending(check: AiCheck | null | undefined) {
  if (!check) return false;
  return check.status === "waiting_for_photos" || (check.status === "checking" && !check.stuck);
}

export const VERDICT_LABEL: Record<AiVerdict, string> = {
  consistent: "Looks consistent",
  worth_a_look: "Worth a look",
  unsure: "Couldn’t tell",
};

export const ANSWER_LABEL: Record<AiAnswer, string> = {
  yes: "Yes",
  no: "No",
  unsure: "Not sure",
};

/** What request_ai_check() gives back, as the message under the button */
export const REQUEST_MESSAGE: Record<string, string | null> = {
  checking: null,
  already_checking: "It’s already checking this record. The answer shows up here when it’s in.",
  too_soon: "It was checked less than a minute ago. Wait a moment, then try again.",
  not_waiting: "This record has been reviewed already, so it wasn’t checked again.",
  not_found: "This record isn’t in the database any more. Reload the page.",
  not_set_up: "The AI check isn’t set up on this database yet. Ask an administrator.",
};

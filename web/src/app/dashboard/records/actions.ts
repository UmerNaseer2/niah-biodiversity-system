"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  changedBeforeDelete,
  changedBySomeoneElse,
  versionFromFormData,
  versionRange,
} from "@/lib/edit-version";
import { parkTime } from "@/lib/format";
import {
  checkRecord,
  idFromFormData,
  rowFromValues,
  tidy,
  tidyValues,
  valuesFromFormData,
  type Errors,
  type Values,
} from "@/lib/record-form";
import { photoFolderOf, RECORD_PHOTO_BUCKET, recordPhotoPaths } from "@/lib/record-photos";
import { authConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type RecordFormState =
  | { status: "idle" }
  | {
      status: "error";
      // For a problem that isn't about one field, like being signed out
      message: string | null;
      fieldErrors: Errors;
      // What was sent, so the form can fill itself in again when the page
      // loaded without JavaScript
      values: Values;
      // The updated_at the form sent, so it keeps checking against that one
      version: string;
    }
  | {
      status: "saved";
      id: string;
      // What was saved, tidied up the way the database has it
      values: Values;
      // The record's updated_at after the save, for the next one
      version: string;
    };

export type DeleteRecordState = { status: "idle" } | { status: "error"; message: string };

/**
 * Anyone can send a request straight to a server action, so each one checks
 * who is signed in itself. Row Level Security on the records table checks
 * again. Gives the reason they can't, or null when they can.
 */
async function whyNotAllowed(doing: string) {
  if (!authConfigured) return "Saving records isn’t set up on this server yet.";
  const session = await getSession();
  if (session.status === "signed-out") {
    return `You’re signed out. Sign in again, then ${doing}.`;
  }
  if (session.status === "no-access") {
    return "Only conservation officers and administrators can change records.";
  }
  return null;
}

/** The staff record pages, and the public pages that show records */
function refreshRecordPages() {
  revalidatePath("/dashboard/records", "layout");
  revalidatePath("/dashboard");
  // The public pages sit in the (public) route group, so the path names it
  revalidatePath("/(public)", "layout");
}

function messageFor(code: string, message: string, what: string) {
  switch (code) {
    case "42501":
      return (
        `The database didn’t let your account ${what}. Ask an administrator ` +
        "to check your role."
      );
    case "23514":
      return "The database turned the record down because one of the values isn’t allowed. Check the height, condition and location.";
    default:
      console.error(`Trying to ${what} failed:`, code, message);
      return "Nothing was saved. Try again, and if it keeps happening, ask an administrator.";
  }
}

/** LIKE treats % and _ as wildcards, so a name can't carry them in */
function exactPattern(name: string) {
  return name.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// The API also reads * in a LIKE pattern as %, and a backslash doesn't stop
// it. No scientific name has a * in it, so a name with one can't match.
const NEVER_A_SPECIES = /\*/;

export async function editRecord(
  _prev: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const values = valuesFromFormData(formData);
  const id = idFromFormData(formData);
  const version = versionFromFormData(formData);
  const failed = (message: string | null, fieldErrors: Errors = {}) => ({
    status: "error" as const,
    message,
    fieldErrors,
    values,
    version,
  });

  const notAllowed = await whyNotAllowed("save your changes");
  if (notAllowed) return failed(notAllowed);
  if (!id) return failed("This isn’t a record the database knows.");

  // The same checks the form runs
  const fieldErrors = checkRecord(values);
  if (Object.keys(fieldErrors).length > 0) return failed(null, fieldErrors);

  const supabase = await createClient();

  // Whether the plant matches a species on our list decides how much of its
  // spot the public sees, so the link follows the name. A name that isn't on
  // the list leaves the record with no species yet, like the phone does.
  const name = tidy(values.speciesName);
  const [speciesResult, currentResult] = await Promise.all([
    NEVER_A_SPECIES.test(name)
      ? { data: null, error: null }
      : supabase
          .from("species_staff")
          .select("id")
          .ilike("scientific_name", exactPattern(name))
          .maybeSingle(),
    supabase.from("records_staff").select("gps, recorded_at").eq("id", id).maybeSingle(),
  ]);
  if (speciesResult.error) {
    return failed(messageFor(speciesResult.error.code, speciesResult.error.message, "edit records"));
  }
  if (currentResult.error) {
    return failed(messageFor(currentResult.error.code, currentResult.error.message, "edit records"));
  }
  if (!currentResult.data) {
    return failed(
      "This record isn’t in the database any more, so there was nothing to " +
        "save. Someone may have deleted it.",
    );
  }

  // The time of the GPS reading stays, as long as the spot is the one the
  // phone captured
  const before = currentResult.data.gps as
    | { lat: number; lng: number; accuracyM: number; capturedAt?: string }
    | null;
  const row = rowFromValues(values);
  const sameSpot =
    before &&
    row.gps &&
    before.lat === row.gps.lat &&
    before.lng === row.gps.lng &&
    before.accuracyM === row.gps.accuracyM;
  // The form only goes down to the minute, so a time the phone saved with
  // seconds keeps them unless someone picks a different minute
  const storedTime = String(currentResult.data.recorded_at);
  const update = {
    ...row,
    recorded_at:
      parkTime(storedTime) === values.recordedAt ? storedTime : row.recorded_at,
    species_slug: speciesResult.data ? String(speciesResult.data.id) : null,
    gps:
      row.gps && sameSpot && before.capturedAt
        ? { ...row.gps, capturedAt: before.capturedAt }
        : row.gps,
  };

  // .select() gives back the rows that changed, so a record that isn't there
  // any more, or that someone else saved first, shows up as none rather than
  // as an error
  let query = supabase.from("records").update(update).eq("id", id);
  if (version) {
    const { from, to } = versionRange(version);
    query = query.gte("updated_at", from).lt("updated_at", to);
  }
  const { data, error } = await query.select("updated_at");

  if (error) return failed(messageFor(error.code, error.message, "edit records"));
  if (data.length === 0) {
    const still = await supabase.from("records_staff").select("id").eq("id", id).maybeSingle();
    if (version && still.data) return failed(changedBySomeoneElse("record"));
    return failed(
      "This record isn’t in the database any more, so there was nothing to " +
        "save. Someone may have deleted it.",
    );
  }

  refreshRecordPages();
  return {
    status: "saved",
    id,
    values: tidyValues(values),
    version: String(data[0].updated_at),
  };
}

export async function deleteRecord(
  _prev: DeleteRecordState,
  formData: FormData,
): Promise<DeleteRecordState> {
  const id = idFromFormData(formData);
  const version = versionFromFormData(formData);

  const notAllowed = await whyNotAllowed("delete the record");
  if (notAllowed) return { status: "error", message: notAllowed };
  if (!id) return { status: "error", message: "This isn’t a record the database knows." };

  // Only the record the page showed is deleted. If someone saved it since,
  // the page may be out of date, so nothing is deleted.
  const supabase = await createClient();
  let query = supabase.from("records").delete().eq("id", id);
  if (version) {
    const { from, to } = versionRange(version);
    query = query.gte("updated_at", from).lt("updated_at", to);
  }
  // All the columns, not photo_folder by name, so deleting still works
  // before 014 is run
  const { data, error } = await query.select("*");

  if (error) {
    return { status: "error", message: messageFor(error.code, error.message, "delete records") };
  }
  if (data.length === 0) {
    const still = await supabase.from("records_staff").select("id").eq("id", id).maybeSingle();
    if (version && still.data) return { status: "error", message: changedBeforeDelete("record") };
    return {
      status: "error",
      message: "This record isn’t in the database any more. Someone may have deleted it already.",
    };
  }

  // Its photos go too. The record is already gone, so photos that won't
  // delete only get logged.
  const photoFolder = photoFolderOf(data[0]);
  if (photoFolder) {
    const paths = await recordPhotoPaths(supabase, photoFolder, id);
    if (paths && paths.length > 0) {
      const removed = await supabase.storage.from(RECORD_PHOTO_BUCKET).remove(paths);
      if (removed.error) {
        console.error("Couldn't delete a deleted record's photos:", id, removed.error.message);
      }
    }
  }

  refreshRecordPages();
  // Back to the list, which says what was deleted
  redirect(`/dashboard/records?deleted=${encodeURIComponent(String(data[0].tag_code))}`);
}

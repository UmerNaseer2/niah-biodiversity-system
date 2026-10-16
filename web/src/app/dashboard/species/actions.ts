"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  checkDetails,
  checkNewSpecies,
  rowFromValues,
  slugFor,
  slugFromFormData,
  tidy,
  tidyValues,
  valuesFromFormData,
  type Errors,
  type Values,
} from "@/lib/species-form";
import { authConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type SpeciesFormState =
  | { status: "idle" }
  | {
      status: "error";
      // For a problem that isn't about one field, like being signed out
      message: string | null;
      fieldErrors: Errors;
      // What was sent, so the form can fill itself in again when the page
      // loaded without JavaScript
      values: Values;
    }
  | {
      status: "saved";
      slug: string;
      // What was saved, tidied up the way the database has it
      values: Values;
    };

export type DeleteSpeciesState = { status: "idle" } | { status: "error"; message: string };

/**
 * Anyone can send a request straight to a server action, so each one checks
 * who is signed in itself. Row Level Security on the species table checks
 * again. Gives the reason they can't, or null when they can.
 */
async function whyNotAllowed(doing: string) {
  if (!authConfigured) return "Saving species isn’t set up on this server yet.";
  const session = await getSession();
  if (session.status === "signed-out") {
    return `You’re signed out. Sign in again, then ${doing}.`;
  }
  if (session.status === "no-access") {
    return "Only conservation officers and administrators can change species.";
  }
  return null;
}

/** The staff species pages, and the public plant list and plant pages */
function refreshSpeciesPages() {
  revalidatePath("/dashboard/species", "layout");
  // The public pages sit in the (public) route group, so the path names it
  revalidatePath("/(public)/plants", "layout");
}

function messageFor(code: string, message: string, what: string) {
  switch (code) {
    case "42501":
      return (
        `The database didn’t let your account ${what}. Ask an administrator ` +
        "to check your role."
      );
    case "PGRST204":
      // The API doesn't know the rough_area_only column yet
      return (
        "Nothing was saved, because the database needs an update first " +
        "(supabase/007_species_fixes.sql). Ask an administrator."
      );
    default:
      console.error(`Trying to ${what} failed:`, code, message);
      return "Nothing was saved. Try again, and if it keeps happening, ask an administrator.";
  }
}

export async function addSpecies(
  _prev: SpeciesFormState,
  formData: FormData,
): Promise<SpeciesFormState> {
  const values = valuesFromFormData(formData);
  const failed = (message: string | null, fieldErrors: Errors = {}) => ({
    status: "error" as const,
    message,
    fieldErrors,
    values,
  });

  const notAllowed = await whyNotAllowed("add the species");
  if (notAllowed) return failed(notAllowed);

  // The same checks the form runs. A name that's already there comes back
  // from the database as a duplicate key, so it isn't looked up first.
  const fieldErrors = checkNewSpecies(values, []);
  if (Object.keys(fieldErrors).length > 0) return failed(null, fieldErrors);

  const name = tidy(values.scientificName);
  const slug = slugFor(name);
  const row = rowFromValues(values);

  const supabase = await createClient();
  const { error } = await supabase
    .from("species")
    .insert({ id: slug, scientific_name: name, ...row });

  if (error?.code === "23505") {
    return failed(null, { "scientific-name": `${name} is already in the database.` });
  }
  if (error) return failed(messageFor(error.code, error.message, "add species"));

  refreshSpeciesPages();
  return { status: "saved", slug, values: tidyValues(values) };
}

export async function editSpecies(
  _prev: SpeciesFormState,
  formData: FormData,
): Promise<SpeciesFormState> {
  const values = valuesFromFormData(formData);
  const slug = slugFromFormData(formData);
  const failed = (message: string | null, fieldErrors: Errors = {}) => ({
    status: "error" as const,
    message,
    fieldErrors,
    values,
  });

  const notAllowed = await whyNotAllowed("save your changes");
  if (notAllowed) return failed(notAllowed);

  // The scientific name can't change, so only the rest is checked and saved
  const fieldErrors = checkDetails(values);
  if (Object.keys(fieldErrors).length > 0) return failed(null, fieldErrors);

  const row = rowFromValues(values);
  const supabase = await createClient();
  // .select() gives back the rows that changed, so a species that isn't
  // there any more shows up as none rather than as an error
  const { data, error } = await supabase
    .from("species")
    .update(row)
    .eq("id", slug)
    .select("scientific_name");

  if (error) return failed(messageFor(error.code, error.message, "edit species"));
  if (data.length === 0) {
    return failed(
      "This species isn’t in the database any more, so there was nothing to " +
        "save. Someone may have deleted it.",
    );
  }

  refreshSpeciesPages();
  return {
    status: "saved",
    slug,
    // The form doesn't send the scientific name, so it comes from the database
    values: { ...tidyValues(values), scientificName: String(data[0].scientific_name) },
  };
}

export async function deleteSpecies(
  _prev: DeleteSpeciesState,
  formData: FormData,
): Promise<DeleteSpeciesState> {
  const slug = slugFromFormData(formData);

  const notAllowed = await whyNotAllowed("delete the species");
  if (notAllowed) return { status: "error", message: notAllowed };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("species")
    .delete()
    .eq("id", slug)
    .select("scientific_name");

  if (error) {
    return { status: "error", message: messageFor(error.code, error.message, "delete species") };
  }
  if (data.length === 0) {
    return {
      status: "error",
      message: "This species isn’t in the database any more. Someone may have deleted it already.",
    };
  }

  refreshSpeciesPages();
  // Back to the list, which says what was deleted
  redirect(
    `/dashboard/species?deleted=${encodeURIComponent(String(data[0].scientific_name))}`,
  );
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
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
import {
  MAX_PHOTOS,
  PHOTO_BUCKET,
  checkPhoto,
  checkPhotoDetails,
  storedKey,
  storedPath,
  type PhotoErrors,
} from "@/lib/species-photos";
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

export type PhotoState =
  | { status: "idle" }
  | {
      status: "error";
      message: string | null;
      fieldErrors: PhotoErrors;
    }
  // done changes each time, so the page can tell two in a row apart
  | { status: "done"; message: string; done: string };

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
  // Tag pages show the species' main photo
  revalidatePath("/(public)/tag", "layout");
}

function messageFor(code: string, message: string, what: string) {
  switch (code) {
    case "42501":
      return (
        `The database didn’t let your account ${what}. Ask an administrator ` +
        "to check your role."
      );
    case "23514":
      // A check in supabase/009 said no, which the website's own checks
      // should have caught first
      console.error(`Trying to ${what} failed a database check:`, message);
      return "Nothing was saved, because the database said the photos weren’t right. Ask an administrator.";
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
    .select("scientific_name, photos");

  if (error) {
    return { status: "error", message: messageFor(error.code, error.message, "delete species") };
  }
  if (data.length === 0) {
    return {
      status: "error",
      message: "This species isn’t in the database any more. Someone may have deleted it already.",
    };
  }

  // Its uploaded photos go too. The species is already gone, so a file that
  // won't delete only gets logged.
  const paths = uploadedPaths(data[0].photos, slug);
  if (paths.length > 0) {
    const removed = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    if (removed.error) {
      console.error("Couldn't delete a deleted species' photos:", slug, removed.error.message);
    }
  }

  refreshSpeciesPages();
  // Back to the list, which says what was deleted
  redirect(
    `/dashboard/species?deleted=${encodeURIComponent(String(data[0].scientific_name))}`,
  );
}

/** The uploaded files in a species' photos, so they can be deleted with it */
function uploadedPaths(photos: unknown, slug: string) {
  if (!Array.isArray(photos)) return [];
  return photos.flatMap((photo) => storedPath(photo, slug) ?? []);
}

/**
 * Opens the file to check it really is a JPEG, PNG or WebP photo, then saves
 * it as a JPEG no bigger than 1600px. sharp leaves out everything but the
 * picture unless it's told to keep it, so the camera details and any GPS
 * location in the file don't end up on the public site. Gives null for
 * anything it can't read.
 */
async function photoToJpeg(file: File) {
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), {
      autoOrient: true,
      // Turns away files that say they're huge, which would take all the memory
      limitInputPixels: 100_000_000,
    });
    const { format } = await image.metadata();
    // sharp can read more than this, like SVG and TIFF, but the site only takes photos
    if (format !== "jpeg" && format !== "png" && format !== "webp") return null;
    return await image
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

const PHOTOS_CHANGED =
  "Someone else changed this species’ photos at the same time, or deleted the " +
  "species, so nothing was saved. Reload the page and try again.";

/**
 * Saves a new photos list, but only if the list in the database is still the
 * one this started from. Otherwise two officers changing photos at the same
 * time could each undo the other's change. Gives an error message, or null
 * when it saved.
 */
async function savePhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
  before: unknown[],
  after: unknown[],
  what: string,
) {
  const { data, error } = await supabase
    .from("species")
    .update({ photos: after })
    .eq("id", slug)
    .eq("photos", JSON.stringify(before))
    .select("id");
  if (error) return messageFor(error.code, error.message, what);
  if (data.length === 0) return PHOTOS_CHANGED;
  return null;
}

/** The species' photos as they're stored, or a message if they didn't load */
async function storedPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
): Promise<{ photos: unknown[] } | { message: string }> {
  const { data, error } = await supabase
    .from("species_staff")
    .select("photos")
    .eq("id", slug)
    .maybeSingle();
  if (error) {
    console.error("Loading the species photos failed:", error.message);
    return { message: "The species’ photos didn’t load, so nothing was saved. Try again." };
  }
  if (!data) {
    return {
      message: "This species isn’t in the database any more. Someone may have deleted it.",
    };
  }
  return { photos: Array.isArray(data.photos) ? data.photos : [] };
}

export async function uploadSpeciesPhoto(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  const failed = (message: string | null, fieldErrors: PhotoErrors = {}) => ({
    status: "error" as const,
    message,
    fieldErrors,
  });

  const notAllowed = await whyNotAllowed("upload the photo");
  if (notAllowed) return failed(notAllowed);

  const slug = slugFromFormData(formData);
  const sent = formData.get("photo");
  const file = sent instanceof File ? sent : null;
  const caption = tidy(String(formData.get("caption") ?? ""));
  const credit = tidy(String(formData.get("credit") ?? ""));
  const makeMain = formData.get("main") === "on";

  const fieldErrors = checkPhoto(file, caption, credit);
  if (!file || Object.keys(fieldErrors).length > 0) return failed(null, fieldErrors);

  const jpeg = await photoToJpeg(file);
  if (!jpeg) {
    return failed(null, {
      "photo-file": "This file couldn’t be opened as a photo. Try a JPEG, PNG or WebP photo.",
    });
  }

  const supabase = await createClient();
  const current = await storedPhotos(supabase, slug);
  if ("message" in current) return failed(current.message);
  const before = current.photos;
  if (before.length >= MAX_PHOTOS) {
    return failed(
      `This species already has ${MAX_PHOTOS} photos, which is the most it can have. Remove one first.`,
    );
  }

  // A new name every time, so an upload never replaces another photo
  const path = `species/${slug}/${randomUUID()}.jpg`;
  const uploaded = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (uploaded.error) {
    console.error("Uploading a species photo failed:", uploaded.error.message);
    return failed(
      "The photo didn’t upload. Try again, and if it keeps happening, ask an " +
        "administrator to check your role.",
    );
  }

  // The first photo is the main one until another is picked
  const photo = { path, caption, credit, isPrimary: makeMain || before.length === 0 };
  const others = makeMain
    ? before.map((old) => ({ ...(old as object), isPrimary: false }))
    : before;
  const problem = await savePhotos(supabase, slug, before, [...others, photo], "add a photo");
  if (problem) {
    // The photo isn't in the list, so it shouldn't stay in the bucket either
    const removed = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (removed.error) {
      console.error("Couldn't delete a photo that didn't save:", path, removed.error.message);
    }
    return failed(problem);
  }

  refreshSpeciesPages();
  return { status: "done", message: "Photo added.", done: path };
}

export async function managePhoto(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  const failed = (message: string) => ({
    status: "error" as const,
    message,
    fieldErrors: {},
  });

  const intent = formData.get("intent");
  if (intent !== "main" && intent !== "remove" && intent !== "details") {
    return failed("Something went wrong. Reload the page.");
  }
  // "Sign in again, then ...", what failed, and what the page says after
  const doing = {
    main: { then: "pick the main photo", what: "pick the main photo", done: "Main photo changed." },
    remove: { then: "remove the photo", what: "remove a photo", done: "Photo removed." },
    details: {
      then: "save the caption",
      what: "change a photo’s caption",
      done: "Caption and credit saved.",
    },
  }[intent];
  const notAllowed = await whyNotAllowed(doing.then);
  if (notAllowed) return failed(notAllowed);

  const slug = slugFromFormData(formData);
  const key = String(formData.get("key") ?? "");
  const shownAt = Number(formData.get("index"));

  // The page checks these first, so this only comes up without JavaScript
  const caption = tidy(String(formData.get("caption") ?? ""));
  const credit = tidy(String(formData.get("credit") ?? ""));
  if (intent === "details") {
    const problems = Object.values(checkPhotoDetails(caption, credit));
    if (problems.length > 0) return failed(`Nothing was saved. ${problems.join(" ")}`);
  }

  const supabase = await createClient();
  const current = await storedPhotos(supabase, slug);
  if ("message" in current) return failed(current.message);
  const before = current.photos;
  // Two outside links can be the same, so the photo's place on the page
  // picks which one. If the photos changed since the page loaded, the key
  // finds it instead.
  const index =
    Number.isInteger(shownAt) && storedKey(before[shownAt], slug) === key
      ? shownAt
      : before.findIndex((photo) => storedKey(photo, slug) === key);
  if (index === -1) {
    return failed("That photo isn’t there any more. Someone may have removed it. Reload the page.");
  }

  const after =
    intent === "main"
      ? before.map((photo, i) => ({ ...(photo as object), isPrimary: i === index }))
      : intent === "details"
        ? before.map((photo, i) =>
            i === index ? { ...(photo as object), caption, credit } : photo,
          )
        : before.filter((_, i) => i !== index);
  const problem = await savePhotos(supabase, slug, before, after, doing.what);
  if (problem) return failed(problem);

  if (intent === "remove") {
    // The page doesn't show it any more either way, so a file that won't
    // delete only gets logged
    const paths = uploadedPaths([before[index]], slug);
    if (paths.length > 0) {
      const removed = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      if (removed.error) {
        console.error("Couldn't delete a removed photo's file:", paths[0], removed.error.message);
      }
    }
  }

  refreshSpeciesPages();
  return { status: "done", message: doing.done, done: `${intent}-${key}-${Date.now()}` };
}

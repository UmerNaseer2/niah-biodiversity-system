import { SUPABASE_URL } from "./supabase/config";

// Species photos (item 18). species.photos is a list, and each photo is
// either an outside link (url), like the Unsplash placeholders, or a file the
// website uploaded to the public botanical-photos bucket (path).
// supabase/009_species_photos.sql checks the same rules before it saves.

export const PHOTO_BUCKET = "botanical-photos";

/** The most photos one species can have */
export const MAX_PHOTOS = 12;

/** The biggest file an officer can upload. Server actions take 4.5 MB (next.config.ts). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** What the upload takes. The server turns them all into JPEG. */
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const MAX_CAPTION = 300;
export const MAX_CREDIT = 200;

const UPLOADED_PATH =
  /^species\/([a-z0-9-]+)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export type SpeciesPhoto = {
  /** Where the browser loads it from */
  src: string;
  caption: string;
  credit: string;
  isPrimary: boolean;
  /** The file in botanical-photos, only for photos the website uploaded */
  path: string | null;
  /** Picks out this photo when an officer removes it or makes it the main one */
  key: string;
};

/** The public link to a file in botanical-photos */
export function publicPhotoUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

/** Whether a path is one the website could have uploaded for this species */
export function isUploadedPath(path: string, slug: string) {
  return UPLOADED_PATH.exec(path)?.[1] === slug;
}

function photoFrom(value: unknown, slug: string): SpeciesPhoto | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const photo = value as Record<string, unknown>;
  if (typeof photo.caption !== "string" || typeof photo.credit !== "string") return null;

  let src: string;
  let path: string | null = null;
  if (typeof photo.path === "string" && isUploadedPath(photo.path, slug)) {
    path = photo.path;
    src = publicPhotoUrl(path);
  } else if (typeof photo.url === "string" && photo.url.startsWith("https://")) {
    src = photo.url;
  } else {
    return null;
  }

  return {
    src,
    caption: photo.caption,
    credit: photo.credit,
    isPrimary: photo.isPrimary === true,
    path,
    key: path ?? src,
  };
}

/**
 * The photos from a species row. Anything that doesn't look like a photo is
 * left out, so a bad entry from before 009 can't break a page.
 */
export function photosFromJson(value: unknown, slug: string): SpeciesPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => photoFrom(item, slug) ?? []);
}

/** The photo marked as the main one, or the first */
export function mainPhoto(photos: SpeciesPhoto[]) {
  return photos.find((photo) => photo.isPrimary) ?? photos[0] ?? null;
}

/** The key of a stored photo, the same way photosFromJson works it out */
export function storedKey(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const photo = value as Record<string, unknown>;
  if (typeof photo.path === "string") return photo.path;
  if (typeof photo.url === "string") return photo.url;
  return null;
}

export type PhotoFieldId = "photo-file" | "photo-caption" | "photo-credit";
export type PhotoErrors = Partial<Record<PhotoFieldId, string>>;

/**
 * Checks a photo before it's uploaded. The page runs this before it sends
 * the form and the server action runs it again, so the file is only what
 * the browser says about it. The server still opens the file to check it's
 * really a photo.
 */
export function checkPhoto(
  file: { size: number; type: string } | null,
  caption: string,
  credit: string,
): PhotoErrors {
  const errors: PhotoErrors = {};
  if (!file || file.size === 0) {
    errors["photo-file"] = "Choose a photo to upload.";
  } else if (!UPLOAD_TYPES.includes(file.type)) {
    errors["photo-file"] = "The photo has to be a JPEG, PNG or WebP file.";
  } else if (file.size > MAX_UPLOAD_BYTES) {
    errors["photo-file"] = "The photo has to be 4 MB or smaller.";
  }
  if (!caption) {
    errors["photo-caption"] = "Add a caption that says what the photo shows.";
  } else if (caption.length > MAX_CAPTION) {
    errors["photo-caption"] = `The caption can be up to ${MAX_CAPTION} characters.`;
  }
  if (!credit) {
    errors["photo-credit"] = "Add who took the photo.";
  } else if (credit.length > MAX_CREDIT) {
    errors["photo-credit"] = `The credit can be up to ${MAX_CREDIT} characters.`;
  }
  return errors;
}

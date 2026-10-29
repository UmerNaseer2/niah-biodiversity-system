import type { createClient } from "./supabase/server";

// Photos the field team takes of a plant. The phone uploads them to the
// private record-photos bucket, into a folder for the account that sent the
// record, like <user id>/<record id>/1.jpg (supabase/005). Only that account,
// officers and admins can open them, because a photo can show where a plant
// grows. The website shows them with links that stop working after an hour.

type Client = Awaited<ReturnType<typeof createClient>>;

export const RECORD_PHOTO_BUCKET = "record-photos";

const LINK_SECONDS = 60 * 60;

export type RecordPhoto = { src: string; name: string };

/** The files in a record's photo folder, or null if Storage didn't answer */
export async function recordPhotoPaths(
  supabase: Client,
  submittedBy: string,
  recordId: string,
) {
  const folder = `${submittedBy}/${recordId}`;
  const { data, error } = await supabase.storage
    .from(RECORD_PHOTO_BUCKET)
    .list(folder, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error) {
    console.error("Listing a record's photos failed:", error.message);
    return null;
  }
  // Folders come back too, with no id
  return data.filter((item) => item.id).map((item) => `${folder}/${item.name}`);
}

/** Links to a record's photos for the next hour, or null if Storage didn't answer */
export async function recordPhotoLinks(
  supabase: Client,
  submittedBy: string,
  recordId: string,
): Promise<RecordPhoto[] | null> {
  const paths = await recordPhotoPaths(supabase, submittedBy, recordId);
  if (!paths) return null;
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(RECORD_PHOTO_BUCKET)
    .createSignedUrls(paths, LINK_SECONDS);
  if (error) {
    console.error("Making links to a record's photos failed:", error.message);
    return null;
  }
  return data.flatMap((link) =>
    link.signedUrl && !link.error
      ? [{ src: link.signedUrl, name: (link.path ?? "").split("/").pop() ?? "" }]
      : [],
  );
}

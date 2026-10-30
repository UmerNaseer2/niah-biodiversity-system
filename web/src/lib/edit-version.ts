// The records and species tables both have an updated_at that a trigger moves
// on every change (supabase/007 and 008). The edit and delete forms send back
// the one they loaded, and a save or delete only goes through if it hasn't
// moved since, so two people at once can't quietly undo each other's changes,
// or delete something that changed after they looked at it.

/** The updated_at the form loaded, or "" if it didn't send one */
export function versionFromFormData(formData: FormData) {
  const version = formData.get("version");
  return typeof version === "string" && !Number.isNaN(Date.parse(version)) ? version : "";
}

/**
 * Supabase gives times to the microsecond and the local stand-in only to the
 * millisecond, so a save matches any updated_at in the same millisecond as
 * the one the form loaded. Date.parse drops the extra digits.
 */
export function versionRange(version: string) {
  const ms = Date.parse(version);
  return { from: new Date(ms).toISOString(), to: new Date(ms + 1).toISOString() };
}

/** What a form says when someone else saved first */
export function changedBySomeoneElse(thing: "record" | "species") {
  return (
    `Someone else saved changes to this ${thing} after you opened it, so ` +
    "yours weren’t saved. Copy anything you need, reload the page to see " +
    "their changes, then make yours again."
  );
}

/** What a delete page says when someone else saved first */
export function changedBeforeDelete(thing: "record" | "species") {
  return (
    `Someone else saved changes to this ${thing} after you opened this page, ` +
    "so it wasn’t deleted. Reload the page to see what changed, then delete " +
    "it again if you still want to."
  );
}

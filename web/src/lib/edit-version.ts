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
 * The updated_at values that count as the one the form loaded. Supabase gives
 * times to the microsecond, so that's an exact match. The local stand-in only
 * gives milliseconds, so there it's anything in the same millisecond, which is
 * also what happens when a Supabase time ends in zeros (Postgres leaves them
 * off). Date.parse drops anything past the milliseconds, so they're added back
 * by hand.
 */
export function versionRange(version: string) {
  const ms = Date.parse(version);
  const digits = version.match(/:\d{2}\.(\d+)/)?.[1] ?? "";
  if (digits.length <= 3) {
    return { from: new Date(ms).toISOString(), to: new Date(ms + 1).toISOString() };
  }
  const micro = Number(digits.slice(3, 6).padEnd(3, "0"));
  const at = (us: number) =>
    new Date(ms + Math.floor(us / 1000))
      .toISOString()
      .replace("Z", `${String(us % 1000).padStart(3, "0")}Z`);
  return { from: at(micro), to: at(micro + 1) };
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

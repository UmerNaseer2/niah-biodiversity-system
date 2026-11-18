// What a page says when part of the database isn't there yet, or keeps failing to load. Only
// administrators can run the SQL files, so only they are told which file to run. Everyone else
// gets plain wording and is asked to tell an administrator.

/** Where the SQL files and the order to run them in are written down */
export const SQL_README = "supabase/README.md";

/** The sensor files, which come as a set */
export const SENSOR_FILES = ["016_1 to 027"];

/** The plain line staff see when part of the database isn't set up */
export const NOT_SET_UP = "This part of the database isn’t set up yet. Ask an administrator.";

type Role = string | null | undefined;

/** "a", "a and b", "a, b and c" */
function listOf(files: string[]) {
  if (files.length <= 1) return files.join("");
  return `${files.slice(0, -1).join(", ")} and ${files.at(-1)}`;
}

/** What an administrator should run. With no files named, it's every file in the README. */
export function whatToRun(files: string[] = []) {
  return files.length > 0
    ? `Run ${listOf(files)} on this database, as ${SQL_README} says.`
    : `Check every file in ${SQL_README} has been run on this database.`;
}

/**
 * For a part of the database that isn't there yet. Staff get NOT_SET_UP, and administrators get
 * which files to run instead of being asked to find an administrator.
 */
export function notSetUp(role: Role, files: string[] = []) {
  if (role !== "admin") return NOT_SET_UP;
  return `This part of the database isn’t set up yet. ${whatToRun(files)}`;
}

/**
 * The end of "X didn't load. Refresh the page, and if it keeps happening, ...". Staff are asked
 * to tell an administrator, and administrators are told what to check.
 */
export function ifItKeepsHappening(role: Role, files: string[] = []) {
  if (role !== "admin") return "ask an administrator.";
  return files.length > 0
    ? `check ${listOf(files)} has been run on this database, as ${SQL_README} says.`
    : `check every file in ${SQL_README} has been run on this database.`;
}

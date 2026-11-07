import { Directory, File, Paths } from 'expo-file-system';

import { newId } from './id';

// The main photo of each species, saved so a visitor can see it with no signal. It's the document
// folder, like the record photos, because the phone can clear the cache folder whenever it runs
// low on space. Only the file name goes in the database, because on an iPhone the full path to
// the app's folders can change when the app updates.
const PHOTO_FOLDER = 'species-photos';

// The website takes uploads of up to 4 MB, but a photo from an outside link can be any size. One
// bigger than this is left out, so it doesn't use up a visitor's data.
const MAX_BYTES = 5 * 1024 * 1024;

// A photo that takes longer than this is stopped and tried again after the next update, so one
// slow link can't hold up the rest.
const TIMEOUT_MS = 60_000;

// Links whose photo was too big. They aren't tried again until the app restarts, so the same big
// photo doesn't start coming down every time the plant info updates.
const tooBig = new Set<string>();

function photoFolder() {
  return new Directory(Paths.document, PHOTO_FOLDER);
}

function removeFile(file: File) {
  try {
    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    console.warn("Couldn't delete a species photo.", error);
  }
}

/**
 * Downloads a species photo into its own new file and gives the file's name, or null if it
 * couldn't, like when the signal went or the photo was too big. A failed download leaves no file
 * behind.
 */
export async function downloadSpeciesPhoto(url: string): Promise<string | null> {
  if (tooBig.has(url)) {
    return null;
  }
  const folder = photoFolder();
  const file = new File(folder, newId());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // The most the photo could be, from what the download has said so far.
  let size = 0;
  try {
    folder.create({ idempotent: true, intermediates: true });
    await File.downloadFileAsync(url, file, {
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        size = Math.max(size, bytesWritten, totalBytes);
        if (size > MAX_BYTES) {
          controller.abort();
        }
      },
    });
    // The download can finish before it gets to say how big the photo is, so check the file too.
    size = Math.max(size, file.size);
    if (size > MAX_BYTES) {
      throw new Error('The photo is too big to save.');
    }
    if (file.size === 0) {
      throw new Error('The photo came down empty.');
    }
    return file.name;
  } catch (error) {
    if (size > MAX_BYTES) {
      tooBig.add(url);
    }
    console.warn("Couldn't download a species photo.", error);
    // On Android a download that stops partway can leave part of the photo in the file.
    removeFile(file);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Where a saved species photo is on the phone, for showing it. */
export function speciesPhotoUri(name: string) {
  return new File(Paths.document, PHOTO_FOLDER, name).uri;
}

/** Deletes a saved species photo, like one that came down after its link changed. */
export function deleteSpeciesPhoto(name: string) {
  removeFile(new File(Paths.document, PHOTO_FOLDER, name));
}

/**
 * Deletes every file in the photo folder that isn't in keepNames, like old photos of a species and
 * half downloaded ones from when the app closed partway. Don't call it while a photo is coming
 * down, or it can delete that one.
 */
export function removeStraySpeciesPhotos(keepNames: readonly string[]) {
  try {
    const folder = photoFolder();
    if (!folder.exists) {
      return;
    }
    const keep = new Set(keepNames);
    for (const entry of folder.list()) {
      if (entry instanceof File && !keep.has(entry.name)) {
        entry.delete();
      }
    }
  } catch (error) {
    // Nothing depends on this working, and it tries again after the next update.
    console.warn("Couldn't clear out old species photos.", error);
  }
}

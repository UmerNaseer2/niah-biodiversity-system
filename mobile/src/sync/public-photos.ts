import { photoFiles } from '@/db/kept-photos';
import type { PublicPhoto } from '@/types/public-copy';

// Downloads the species photos for the saved plant info, after the plant info itself is saved.
// src/state/public-copy-context.tsx runs it with the real file and database functions, and the
// tests run it with stand-ins.

/** What downloading the photos needs from the phone. */
export type PhotoDownloads = {
  /** Says false when the phone has no signal. */
  online: () => Promise<boolean>;
  /** The saved photos, straight from the database. */
  loadPhotos: () => Promise<PublicPhoto[]>;
  /** Downloads a photo and gives the new file's name, or null if it couldn't. */
  download: (url: string) => Promise<string | null>;
  /** Notes the file a photo was saved in. Says false when the photo changed while it came down. */
  saveFile: (speciesSlug: string, url: string, file: string) => Promise<boolean>;
  deleteFile: (file: string) => void;
  /** Deletes the photo files that aren't in the list. */
  removeStray: (keep: string[]) => void;
};

/**
 * Downloads the saved photos that have no file on the phone yet, one at a time, and stops when the
 * signal goes. A photo that fails is tried again after the next plant info update. At the end it
 * deletes the files no saved photo points to, like the old file of a photo that changed. Only one
 * of these should run at a time, or that clear out can delete a photo that's still coming down.
 */
export async function downloadMissingPhotos(steps: PhotoDownloads) {
  const missing = (await steps.loadPhotos()).filter((photo) => !photo.file);
  for (const photo of missing) {
    if (!(await steps.online())) {
      break;
    }
    const file = await steps.download(photo.url);
    if (!file) {
      continue;
    }
    let noted = false;
    try {
      noted = await steps.saveFile(photo.speciesSlug, photo.url, file);
    } catch (error) {
      console.warn("Couldn't save a species photo.", error);
    }
    if (!noted) {
      steps.deleteFile(file);
    }
  }
  steps.removeStray(photoFiles(await steps.loadPhotos()));
}

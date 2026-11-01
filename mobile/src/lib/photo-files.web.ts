// The website version of the app is only for looking at the screens on a computer, so the form
// doesn't offer photos there and no record ever has any. See src/lib/photo-files.ts for the real one.
import type { PickedPhoto } from './photo-files';

export async function savePhoto(_photo: PickedPhoto): Promise<string> {
  throw new Error("Photos can't be saved in the browser.");
}

export function photoUri(path: string) {
  return path;
}

export function deletePhotoFile(_path: string) {}

export async function readPhotoBytes(_path: string): Promise<ArrayBuffer | null> {
  return null;
}

export function removeStrayPhotos(_keepPaths: string[]) {}

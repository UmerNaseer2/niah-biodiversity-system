import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { newId } from './id';

// The document folder, because the phone can clear the cache folder whenever it runs low on space,
// and these can be the only copy for days.
const PHOTO_FOLDER = 'record-photos';

// Big enough for an officer to check the species on the website, and small enough to go up on
// the signal you get near the park. The proposal says photos are compressed to save mobile data.
const LONGEST_SIDE = 2048;
const JPEG_QUALITY = 0.7;

/** The parts of a photo from the camera or library that saving it needs. */
export type PickedPhoto = { uri: string; width: number; height: number };

function fileAt(path: string) {
  return new File(Paths.document, path);
}

/**
 * The camera and the library leave their own copy in the cache, and it can have the GPS spot in it.
 * The name of the picker's folder is checked too, because in Expo Go it isn't under Paths.cache.
 */
function removeFromCache(uri: string) {
  try {
    if (uri.startsWith(Paths.cache.uri) || uri.includes('/ImagePicker/')) {
      const copy = new File(uri);
      if (copy.exists) {
        copy.delete();
      }
    }
  } catch (error) {
    console.warn("Couldn't remove the picked photo from the cache.", error);
  }
}

/**
 * Saves a smaller JPEG of the photo in the document folder, and returns where it is relative to
 * that folder. Writing a new JPEG from the pixels also leaves out the GPS block, which on a library
 * photo can say exactly where it was taken. Only the sizes and the orientation stay in the file.
 * That's why even a small photo goes through this, and it matters here because some of these
 * plants are protected.
 */
export async function savePhoto({ uri, width, height }: PickedPhoto) {
  const context = ImageManipulator.manipulate(uri);
  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    if (Math.max(width, height) > LONGEST_SIDE) {
      context.resize(width >= height ? { width: LONGEST_SIDE } : { height: LONGEST_SIDE });
    }
    image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    new Directory(Paths.document, PHOTO_FOLDER).create({ idempotent: true, intermediates: true });
    const path = `${PHOTO_FOLDER}/${newId()}.jpg`;
    await new File(saved.uri).move(fileAt(path));
    return path;
  } finally {
    image?.release();
    context.release();
    removeFromCache(uri);
  }
}

/** Where a saved photo is right now, for showing it. */
export function photoUri(path: string) {
  return fileAt(path).uri;
}

/** Deletes a saved photo. A file that's already gone is fine. */
export function deletePhotoFile(path: string) {
  try {
    const file = fileAt(path);
    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    console.warn("Couldn't delete a photo file.", error);
  }
}

/** The bytes of a saved photo, or null if the file isn't on the phone any more. */
export async function readPhotoBytes(path: string) {
  const file = fileAt(path);
  return file.exists ? file.arrayBuffer() : null;
}

/**
 * Deletes photo files that no record owns, like the ones on the form when the app was closed
 * before saving. Only call it before the form can be used, or it would delete what's on the form.
 */
export function removeStrayPhotos(keepPaths: string[]) {
  try {
    const folder = new Directory(Paths.document, PHOTO_FOLDER);
    if (!folder.exists) {
      return;
    }
    const keep = new Set(keepPaths.map((path) => path.slice(path.lastIndexOf('/') + 1)));
    for (const entry of folder.list()) {
      if (entry instanceof File && !keep.has(entry.name)) {
        entry.delete();
      }
    }
  } catch (error) {
    // Nothing depends on this working, and it tries again the next time the app opens.
    console.warn("Couldn't clear out old photo files.", error);
  }
}

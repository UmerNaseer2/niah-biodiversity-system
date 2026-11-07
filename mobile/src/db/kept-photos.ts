import type { NewPublicPhoto, PublicPhoto } from '@/types/public-copy';

/**
 * The photos to save with new plant info. A photo whose link hasn't changed keeps the copy that's
 * already on the phone, so it doesn't come down again. With no new list, like when the photos
 * couldn't be downloaded, the saved photos stay for every species still in the plant info. Only
 * the first photo of a species counts, and a photo with no link or no species is left out.
 */
export function keptPhotos(
  next: readonly NewPublicPhoto[] | null | undefined,
  saved: readonly PublicPhoto[],
  speciesSlugs: ReadonlySet<string>,
): PublicPhoto[] {
  const before = new Map(saved.map((photo) => [photo.speciesSlug, photo]));
  const kept: PublicPhoto[] = [];
  const seen = new Set<string>();
  for (const photo of next ?? saved) {
    if (!speciesSlugs.has(photo.speciesSlug) || seen.has(photo.speciesSlug) || !photo.url) {
      continue;
    }
    seen.add(photo.speciesSlug);
    const old = before.get(photo.speciesSlug);
    kept.push({
      speciesSlug: photo.speciesSlug,
      url: photo.url,
      caption: photo.caption,
      credit: photo.credit,
      file: old?.url === photo.url ? old.file : undefined,
    });
  }
  return kept;
}

/** The names of the photo files saved on the phone, for clearing out the ones nothing uses. */
export function photoFiles(photos: readonly PublicPhoto[]) {
  return photos.flatMap((photo) => (photo.file ? [photo.file] : []));
}

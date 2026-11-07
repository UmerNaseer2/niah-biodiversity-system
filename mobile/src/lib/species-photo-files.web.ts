// The website version of the app is only for looking at the screens on a computer, so it never
// downloads species photos and none show there. See src/lib/species-photo-files.ts for the real
// one.

export async function downloadSpeciesPhoto(_url: string): Promise<string | null> {
  return null;
}

export function speciesPhotoUri(name: string) {
  return name;
}

export function deleteSpeciesPhoto(_name: string) {}

export function removeStraySpeciesPhotos(_keepNames: readonly string[]) {}

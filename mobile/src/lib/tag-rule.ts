import { isThreatened } from '@/lib/iucn';
import type { PlantRecord } from '@/types/plant-record';
import type { PublicSpecies } from '@/types/public-copy';

// Some plants get a tag whose QR code holds only the tag code, with no web address. A normal phone
// camera then can't open a page that names the species at that spot, but staff can still scan it in
// the Niah app. It's the same rule as the rough area on the public map (records_public in
// supabase/019), and the website has the same rule and words in web/src/lib/code-only-tag.ts.

const AFTER = 'so its tag holds only the code. Staff can scan it in the Niah app.';

/** Capitals and extra spaces don't count, the same as records_public on the server. */
function plainName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Why this record's tag holds only its code, in one line for the screen, or null when the tag can
 * hold a link to the plant's page. The species comes from the plant info saved on the phone.
 */
export function codeOnlyReason(
  record: Pick<PlantRecord, 'speciesName' | 'speciesSlug'>,
  publicSpecies: readonly PublicSpecies[],
): string | null {
  if (!record.speciesSlug) {
    return `This plant isn't matched to a species yet, ${AFTER}`;
  }
  const species = publicSpecies.find((item) => item.slug === record.speciesSlug);
  if (!species) {
    return `This phone doesn't have the plant info for this species yet, ${AFTER}`;
  }
  if (plainName(record.speciesName) !== plainName(species.scientificName)) {
    return `This record's name doesn't match its species, ${AFTER}`;
  }
  if (species.sarawakProtected) {
    return `This species is protected, ${AFTER}`;
  }
  if (isThreatened(species.iucnCode)) {
    return `This species is threatened, ${AFTER}`;
  }
  if (species.iucnCode === 'DD' || species.iucnCode === 'NE') {
    return `This species' risk isn't known yet, ${AFTER}`;
  }
  // Left out means the phone saved it before it knew, so it counts as rough until the next download.
  if (species.roughAreaOnly !== false) {
    return `This species only shows a rough area on the map, ${AFTER}`;
  }
  return null;
}

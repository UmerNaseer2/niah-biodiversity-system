// Some plants get a tag whose QR code holds only the tag code, with no web address. A normal phone
// camera then can't open a page that names the species at that spot, but staff can still scan it in
// the Niah app. It's the same rule as the rough area on the public map (records_public in
// supabase/030 and hidesLocation in data/species.ts), so a plant whose spot is hidden gets one.
// The phone has the same rule in mobile/src/lib/tag-rule.ts.

import { showsExactSpot, type IucnCode } from "./iucn.ts";

/** What the rule needs to know about the species a record is linked to */
export type TagSpecies = {
  scientificName: string;
  iucn: IucnCode;
  sarawakProtected: boolean;
  roughAreaOnly?: boolean;
};

const AFTER = "so its tag holds only the code. Staff can scan it in the Niah app.";

/** Capitals and extra spaces don't count, the same as sameName in review.ts */
function plainName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Why this record's tag holds only its code, in one line for the screen, or null when the tag can
 * hold a link to the plant's page.
 */
export function codeOnlyReason(recordName: string, species: TagSpecies | null | undefined): string | null {
  if (!species) return `This plant isn’t matched to a species yet, ${AFTER}`;
  if (plainName(recordName) !== plainName(species.scientificName)) {
    return `This record’s name doesn’t match its species, ${AFTER}`;
  }
  if (showsExactSpot(species.iucn, species.sarawakProtected, species.roughAreaOnly ?? false)) return null;
  if (species.sarawakProtected) return `This species is protected, ${AFTER}`;
  if (["VU", "EN", "CR"].includes(species.iucn)) return `This species is threatened, ${AFTER}`;
  return `This species only shows a rough area on the map, ${AFTER}`;
}

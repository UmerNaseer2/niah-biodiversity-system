import type { PlantCondition } from './plant-record';

/**
 * The IUCN Red List codes the server's species table takes, the same as web/src/lib/iucn.ts.
 * DD is Data Deficient and NE is Not Evaluated.
 */
export const IUCN_CODES = ['LC', 'NT', 'VU', 'EN', 'CR', 'DD', 'NE'] as const;

export type IucnCode = (typeof IUCN_CODES)[number];

export function isIucnCode(value: unknown): value is IucnCode {
  return (IUCN_CODES as readonly unknown[]).includes(value);
}

/** What the public website shows about a species, saved on the phone for visitors. */
export type PublicSpecies = {
  /** The species' ID on the server. A record's speciesSlug points to it. */
  slug: string;
  scientificName: string;
  /** Who first described the species, written after its scientific name. Can be empty. */
  authority: string;
  family: string;
  commonNames: string[];
  iucnCode: IucnCode;
  sarawakProtected: boolean;
  /** The name botanists use now, when the species has been renamed. */
  newerName?: string;
  summary: string;
  about: string;
  habitat: string;
  uses: string;
};

/** What the public website shows about one tagged plant. It has no location on purpose. */
export type PublicRecord = {
  id: string;
  /** The code printed on the plant's tag, like NNP-3F2A9C. */
  tagCode: string;
  speciesSlug?: string;
  speciesName: string;
  commonName?: string;
  heightM?: number;
  /** Left out when the server sends a condition this app doesn't know. */
  condition?: PlantCondition;
  /**
   * ISO 8601 timestamp. The server can cut it to the start of the day in park time, so pages
   * should only show the date.
   */
  recordedAt: string;
};

/** The plant info saved on the phone, and when it last came down. */
export type PublicCopy = {
  species: PublicSpecies[];
  records: PublicRecord[];
  /** ISO 8601 timestamp, or null before the first download. */
  downloadedAt: string | null;
};

/** The main photo of a species in the saved plant info, the one the website shows first. */
export type PublicPhoto = {
  speciesSlug: string;
  /** Where the photo is on the server. A new link means the photo changed. */
  url: string;
  /** Says what the photo shows. Can be empty. */
  caption: string;
  /** Who took the photo. Can be empty. */
  credit: string;
  /** The name of the copy saved on the phone, missing until the photo has come down. */
  file?: string;
};

/** A photo as the server lists it, before the phone has a copy. */
export type NewPublicPhoto = Omit<PublicPhoto, 'file'>;

/** A tag this phone scanned. Scans stay on the phone and never go to the server. */
export type ScanEntry = {
  tagCode: string;
  /** ISO 8601 timestamp of the last time this tag was scanned. */
  scannedAt: string;
};

import { heightErrorMessage, parseHeight } from '@/lib/height';

// Longest real names are about 40 characters, so these only stop pasted junk. Notes get more room
// for things like damage, fruit and what's growing nearby.
export const MAX_SPECIES_LENGTH = 120;
export const MAX_COMMON_NAME_LENGTH = 80;
export const MAX_NOTES_LENGTH = 1000;

/** Trims the ends and squashes runs of spaces, so the same name always looks the same. */
export function tidyName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

type RecordFormInput = {
  species: string;
  heightText: string;
  /** True while the phone is waiting for a GPS fix. */
  locating: boolean;
  hasLocation: boolean;
};

export type RecordFormCheck = {
  speciesError?: string;
  heightError?: string;
  /** Undefined when the height box is empty or wrong. */
  heightM?: number;
  canSave: boolean;
  /** Shown under the Save button, so people know why it's greyed out. */
  saveHint: string;
};

/**
 * Checks the New Record form. Only the species is required. Height is optional but has to be a
 * real tree height, and saving waits until a GPS fix that is already on its way comes back.
 */
export function checkRecordForm({
  species,
  heightText,
  locating,
  hasLocation,
}: RecordFormInput): RecordFormCheck {
  const height = parseHeight(heightText);
  const speciesError = tidyName(species) === '' ? 'Add the species name.' : undefined;
  const heightError = height.valid ? undefined : heightErrorMessage(height.problem);
  const canSave = !speciesError && !heightError && !locating;

  let saveHint = 'Saved on this phone first. It uploads when you sync.';
  if (speciesError) {
    saveHint = 'Add the species name to save.';
  } else if (heightError) {
    saveHint = 'Fix the height to save.';
  } else if (locating) {
    saveHint = 'Waiting for the location…';
  } else if (!hasLocation) {
    saveHint = 'You can save without a location, but try to capture one first.';
  }

  return {
    speciesError,
    heightError,
    heightM: height.valid ? height.value : undefined,
    canSave,
    saveHint,
  };
}

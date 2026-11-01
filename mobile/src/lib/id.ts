import { randomUUID } from 'expo-crypto';

/**
 * Makes a v4 UUID on the phone, so a record has its ID before it ever reaches the server. If an
 * upload runs twice, the server turns the second one away because the ID is already there, so a
 * record is never saved twice. expo-crypto gets the random numbers from the phone's secure random
 * number generator.
 */
export function newId(): string {
  return randomUUID();
}

/**
 * Short code printed under the QR code, like NNP-3F2A9C (NNP for Niah National Park).
 * Six hex characters gives about 16 million codes, so two records can end up with the same one.
 * The server turns the second one down, and the record's page offers it a new tag.
 */
export function tagCodeFor(id: string) {
  return `NNP-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** Uppercase letters and digits only, so "nnp-3f2a9c" and "NNP 3F2A9C" compare the same. */
function compact(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Takes the printed tag code with or without the NNP- part, in any case, or a full record ID.
 * Needs at least 6 characters so a half typed code doesn't match the wrong plant.
 */
export function matchesTag(record: { id: string; tagCode: string }, input: string) {
  const query = compact(input);
  if (query.length < 6) {
    return false;
  }
  const tag = compact(record.tagCode);
  return query === tag || query === tag.slice(3) || query === compact(record.id);
}

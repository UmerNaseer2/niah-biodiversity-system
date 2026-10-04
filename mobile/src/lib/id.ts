/**
 * Makes a v4 UUID on the phone, so a record has its ID before it ever reaches the server and
 * an upload that runs twice updates the same row instead of making a duplicate.
 * The Math.random fallback is only for the skeleton. Item 9 can switch to expo-crypto.
 */
export function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random % 4) + 8;
    return value.toString(16);
  });
}

/**
 * Short code printed under the QR code, like NNP-3F2A9C (NNP for Niah National Park).
 * Six hex characters gives about 16 million codes. Item 12 should still check for clashes
 * before printing a tag.
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

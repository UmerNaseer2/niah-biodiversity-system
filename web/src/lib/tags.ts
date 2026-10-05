// Tag helpers live apart from the mock records so client components can use
// them without pulling record data (and coordinates) into the browser.

/** The code stamped on the metal tag, same rule as the mobile app */
export function tagCode(recordId: string) {
  return `NNP-${recordId.slice(0, 6).toUpperCase()}`;
}

/** Accepts "nnp-3f2a9c", "NNP 3F2A9C" or just "3f2a9c" */
export function normaliseTag(input: string) {
  const code = input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^NNP-?/, "");
  return /^[0-9A-Z]{6}$/.test(code) ? `NNP-${code}` : null;
}

/** Route params can arrive encoded or not, and a bad % sequence throws */
export function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

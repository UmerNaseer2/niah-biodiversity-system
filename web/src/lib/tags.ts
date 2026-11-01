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

// A printed tag stays on the plant for years, so only https will do. Plain http
// is for trying it out on one computer. Same rule as the phone's lib/qr.ts.
const SITE =
  /^(?:https:\/\/[a-z0-9.-]+|http:\/\/(?:127\.0\.0\.1|localhost))(?::\d+)?(?:\/[\w./-]*)?$/i;

/**
 * What goes in a tag's QR code: a link to the plant's page, so a normal phone
 * camera can open it. With no SITE_URL set it's only the code, which the phone
 * app's scanner can still read. SITE_URL has no NEXT_PUBLIC_ on purpose, since
 * tags are drawn on the server and the browser has no use for it.
 */
export function tagQrText(code: string) {
  const site = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  return site && SITE.test(site) ? `${site}/tag/${code}` : code;
}

/** Route params can arrive encoded or not, and a bad % sequence throws */
export function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

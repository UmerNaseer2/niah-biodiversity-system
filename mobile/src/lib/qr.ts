// What goes in a plant tag's QR code, and what the app takes back out of one. A tag holds a link to
// the plant's page on the website (https://<website>/tag/NNP-3F2A9C), so a visitor's phone camera
// can open it too. A build with no website address puts the tag code on its own (NNP-3F2A9C).
// The app only reads the code out of a link. It never opens links from a QR code.

/** No tag QR code is anywhere near this long, so anything longer isn't read at all. */
export const MAX_QR_LENGTH = 500;

/** How long a QR code has to be out of view before it counts as a new scan. */
export const RESCAN_AFTER_MS = 1500;

const TAG_CODE = /^NNP-?([0-9A-Z]{6})$/;

// http or https, any website, any path that ends in /tag/<code>, then maybe a slash, a query or
// a hash.
const TAG_LINK = /^https?:\/\/[^/?#\s]+(?:\/[^?#\s]*)?\/tag\/([^/?#\s]+)\/?(?:[?#]\S*)?$/i;

// A printed tag stays on the plant for years, so only https will do. Plain http is for trying it
// out against a website running on the same computer.
const WEBSITE =
  /^(?:https:\/\/[a-z0-9.-]+|http:\/\/(?:127\.0\.0\.1|localhost))(?::\d+)?(?:\/[\w./-]*)?$/i;

/** No real address is near this long, and a much longer one wouldn't fit a QR code that reads. */
const MAX_WEBSITE_LENGTH = 200;

/** The website's address with no slash on the end, or undefined if it isn't one a tag can use. */
export function cleanWebsite(address: string | undefined) {
  const text = address?.trim();
  return text && text.length <= MAX_WEBSITE_LENGTH && WEBSITE.test(text)
    ? text.replace(/\/+$/, '')
    : undefined;
}

/** The website this build's tags link to. Metro only fills in the value when written in full. */
export function tagWebsite() {
  return cleanWebsite(process.env.EXPO_PUBLIC_SITE_URL);
}

/** What the QR code of a tag holds. */
export function tagQrText(tagCode: string, website: string | undefined) {
  return website ? `${website}/tag/${tagCode}` : tagCode;
}

/** A bad % sequence makes decodeURIComponent throw, so keep the text as it was. */
function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * NNP-XXXXXX from a code in any case, with or without the hyphen, or undefined. The NNP part has to
 * be there, so a QR code with 6 letters or digits in it, or a link to a blog's /tag/nature page,
 * doesn't get taken for a tag.
 */
function tagCodeIn(text: string) {
  const match = TAG_CODE.exec(text.toUpperCase().replace(/\s+/g, ''));
  return match ? `NNP-${match[1]}` : undefined;
}

/**
 * Reads the tag code out of a scanned QR code, as NNP-XXXXXX. Gives back undefined for anything
 * that isn't a plant tag, like a website or Wi-Fi QR code.
 */
export function parseTagQr(data: string): string | undefined {
  if (data.length > MAX_QR_LENGTH) {
    return undefined;
  }
  const text = data.trim();
  const link = TAG_LINK.exec(text);
  if (link) {
    return tagCodeIn(decode(link[1]));
  }
  return tagCodeIn(text);
}

/**
 * The camera reports a QR code many times a second while it's in view. This says if a sighting is
 * a new scan: the first time a code shows up, or when it comes back after being out of view for
 * RESCAN_AFTER_MS. `seen` holds when each code was last seen, and this keeps it up to date.
 */
export function isNewScan(seen: Map<string, number>, data: string, now: number): boolean {
  const last = seen.get(data);
  // Forget codes that left the view a while ago, so the map stays small.
  for (const [code, seenAt] of seen) {
    if (now - seenAt >= RESCAN_AFTER_MS) {
      seen.delete(code);
    }
  }
  seen.set(data, now);
  return last === undefined || now - last >= RESCAN_AFTER_MS;
}

/** What a photo's QR codes come to. */
export type PhotoQr =
  | { found: 'none' }
  | { found: 'several'; count: number }
  | { found: 'one'; data: string };

/**
 * Picks the QR code to open from all the ones read out of a photo. A plant tag comes before any
 * other QR code, so a photo of a tag next to a poster still works. Two different tags in one
 * photo, like a sheet of printed tags, can't be told apart, so none of them is picked. A tag's
 * link and its code on its own count as the same tag.
 */
export function pickPhotoQr(texts: readonly string[]): PhotoQr {
  const tags = new Map<string, string>();
  for (const data of texts) {
    const tag = parseTagQr(data);
    if (tag && !tags.has(tag)) {
      tags.set(tag, data);
    }
  }
  if (tags.size > 1) {
    return { found: 'several', count: tags.size };
  }
  // With no tag in it, the first QR code is opened anyway so the screen can say it isn't a tag.
  const data = tags.values().next().value ?? texts[0];
  return data === undefined ? { found: 'none' } : { found: 'one', data };
}

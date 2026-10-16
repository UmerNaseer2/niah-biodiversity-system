// What the app takes from a QR code. A plant tag's QR code holds either the tag code on its own
// (NNP-3F2A9C) or a link to the plant's page on the website (https://<website>/tag/NNP-3F2A9C), so
// a visitor's phone camera can open it too. Item 12 prints the tags and picks one of the two.
// The app only reads the code out of a link. It never opens links from a QR code.

/** No tag QR code is anywhere near this long, so anything longer isn't read at all. */
export const MAX_QR_LENGTH = 500;

/** How long a QR code has to be out of view before it counts as a new scan. */
export const RESCAN_AFTER_MS = 1500;

const TAG_CODE = /^(NNP-?)?([0-9A-Z]{6})$/;

// http or https, any website, any path that ends in /tag/<code>, then maybe a slash, a query or
// a hash.
const TAG_LINK = /^https?:\/\/[^/?#\s]+(?:\/[^?#\s]*)?\/tag\/([^/?#\s]+)\/?(?:[?#]\S*)?$/i;

/** A bad % sequence makes decodeURIComponent throw, so keep the text as it was. */
function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** NNP-XXXXXX from a code in any case, with or without the hyphen, or undefined. */
function tagCodeIn(text: string, needsPrefix: boolean) {
  const match = TAG_CODE.exec(text.toUpperCase().replace(/\s+/g, ''));
  if (!match || (needsPrefix && !match[1])) {
    return undefined;
  }
  return `NNP-${match[2]}`;
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
    // The website's tag page works without the NNP part, so a link can leave it out.
    return tagCodeIn(decode(link[1]), false);
  }
  // On its own the code needs the NNP part, so any QR code with 6 letters or digits in it
  // doesn't get taken for a tag.
  return tagCodeIn(text, true);
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

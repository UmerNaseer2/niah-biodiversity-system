// The tallest tree measured in Borneo is about 100 m, so anything over this is a typo.
export const MAX_HEIGHT_M = 120;

// Digits with an optional dot or comma, like "12", "12.5", "12,5", "12." or ".5".
// Number() on its own would also take things like "1e2" or "0x10".
const DECIMAL = /^(\d+([.,]\d*)?|[.,]\d+)$/;

/** Reads "12.5" or "12,5". An empty box is fine because height is optional. */
export function parseHeight(text: string): { valid: boolean; value?: number } {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { valid: true };
  }
  if (!DECIMAL.test(trimmed)) {
    return { valid: false };
  }
  const value = Number(trimmed.replace(',', '.'));
  if (value <= 0 || value > MAX_HEIGHT_M) {
    return { valid: false };
  }
  return { valid: true, value };
}

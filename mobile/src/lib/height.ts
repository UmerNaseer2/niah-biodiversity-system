// The tallest tree measured in Borneo is about 100 m, so anything over this is a typo.
export const MAX_HEIGHT_M = 120;

// The database keeps heights as NUMERIC(5,2), so anything past 2 decimal places would be rounded
// off without telling anyone. Nobody measures a tree to the millimetre anyway.
export const MAX_HEIGHT_DECIMALS = 2;

// Digits with an optional dot or comma, like "12", "12.5", "12,5", "12." or ".5".
// Number() on its own would also take things like "1e2" or "0x10".
const DECIMAL = /^(\d+([.,]\d*)?|[.,]\d+)$/;

/** Why a height was turned down, so the form can say what to fix. */
export type HeightProblem = 'format' | 'range' | 'decimals';

export type HeightResult =
  | { valid: true; value?: number }
  | { valid: false; problem: HeightProblem };

/** Reads "12.5" or "12,5". An empty box is fine because height is optional. */
export function parseHeight(text: string): HeightResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { valid: true };
  }
  if (!DECIMAL.test(trimmed)) {
    return { valid: false, problem: 'format' };
  }
  const value = Number(trimmed.replace(',', '.'));
  if (value <= 0 || value > MAX_HEIGHT_M) {
    return { valid: false, problem: 'range' };
  }
  // Trailing zeros don't count, so "12.500" is still 12.5.
  const decimals = (trimmed.split(/[.,]/)[1] ?? '').replace(/0+$/, '');
  if (decimals.length > MAX_HEIGHT_DECIMALS) {
    return { valid: false, problem: 'decimals' };
  }
  return { valid: true, value };
}

/** What to show under the Height box when parseHeight turns it down. */
export function heightErrorMessage(problem: HeightProblem) {
  if (problem === 'decimals') {
    return `Use ${MAX_HEIGHT_DECIMALS} decimal places at most, like 12.25`;
  }
  return `Enter a height in metres between 0 and ${MAX_HEIGHT_M}, like 12.5`;
}

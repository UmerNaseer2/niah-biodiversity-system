/**
 * Who uses the app on this phone. It gets picked the first time the app opens.
 * - visitor: someone visiting the park. They don't sign in. They scan plant tags and read about
 *   the plants, and the plant info is saved on the phone so it works with no signal.
 * - staff: someone who works at the park. They sign in, record plants and send them to the team.
 */
export const APP_MODES = ['visitor', 'staff'] as const;

export type AppMode = (typeof APP_MODES)[number];

/** Whether a value read back from the phone is one of the modes, so a bad value can't sneak in. */
export function isAppMode(value: unknown): value is AppMode {
  return (APP_MODES as readonly unknown[]).includes(value);
}

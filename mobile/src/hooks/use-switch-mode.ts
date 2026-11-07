import { useRef, useState } from 'react';

import { announce } from '@/lib/announce';
import { useRecords } from '@/state/records-context';
import type { AppMode } from '@/types/app-mode';

export const SWITCH_FAILED = "Couldn't save that on this phone. Try again.";

/**
 * Saves who uses this phone, for the buttons that pick visitor or staff. Every page that uses it
 * is swapped for another one once the choice is saved, so `switching` stays on until then and a
 * tap while the page goes can't pick again.
 */
export function useSwitchMode() {
  const { setMode } = useRecords();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second tap can land before the first one re-renders the page, so this stops it.
  const busy = useRef(false);

  async function switchTo(mode: AppMode) {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setSwitching(true);
    setError(null);
    try {
      await setMode(mode);
    } catch (failure) {
      console.warn("Couldn't save who uses this phone.", failure);
      busy.current = false;
      setSwitching(false);
      setError(SWITCH_FAILED);
      announce(SWITCH_FAILED);
    }
  }

  return { switchTo, switching, error };
}

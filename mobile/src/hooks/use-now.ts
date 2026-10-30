import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The time, read again whenever the app comes back to the front. A phone left on the Home screen
 * overnight would otherwise keep counting yesterday's records as today's in the morning.
 */
export function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(new Date());
      }
    });
    return () => subscription.remove();
  }, []);

  return now;
}

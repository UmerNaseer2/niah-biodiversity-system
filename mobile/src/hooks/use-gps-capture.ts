import {
  Accuracy,
  getForegroundPermissionsAsync,
  hasServicesEnabledAsync,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
  type LocationOptions,
  type LocationSubscription,
} from 'expo-location';
import { useEffect, useReducer } from 'react';

import {
  FIRST_FIX_TIMEOUT_MS,
  gpsReducer,
  IMPROVE_FOR_MS,
  INITIAL_GPS_STATE,
  isCapturing,
  type GpsStatus,
} from '@/lib/gps';
import type { GpsReading } from '@/types/plant-record';

// Highest turns on the GPS chip on both iOS and Android. BestForNavigation is meant for driving,
// and the botanist stands still next to the plant. Android would otherwise ask to turn on Wi-Fi
// and mobile network location first, and saying no there fails every capture. GPS works without
// them, and there's usually no signal in the forest anyway.
const WATCH_OPTIONS: LocationOptions = {
  accuracy: Accuracy.Highest,
  timeInterval: 1000,
  distanceInterval: 0,
  mayShowUserSettingsDialog: false,
};

export type GpsCapture = {
  status: GpsStatus;
  /** The location the record gets saved with. */
  location?: GpsReading;
  /** Best fix so far while the phone is still improving it. */
  best?: GpsReading;
  /** True while the phone is still working on a fix. */
  locating: boolean;
  /** False when only the Settings app can give the permission back. */
  canAskAgain: boolean;
  start: () => void;
  cancel: () => void;
  /** Stops early and keeps the best fix so far. */
  accept: () => void;
  /** Forgets the location, ready for the next record. */
  clear: () => void;
};

/**
 * Gets a GPS fix for a plant record with expo-location. It watches the position instead of asking
 * once, so it can wait for a good fix, and it stops watching as soon as the capture is over.
 */
export function useGpsCapture(): GpsCapture {
  const [state, dispatch] = useReducer(gpsReducer, INITIAL_GPS_STATE);
  const locating = isCapturing(state.status);

  // Runs once per capture. The cleanup stops the watch when the capture ends or the screen goes
  // away, and `active` makes sure nothing from an old capture changes the state after that.
  useEffect(() => {
    if (!locating) {
      return;
    }
    let active = true;
    let subscription: LocationSubscription | undefined;

    async function watch() {
      let permission = await getForegroundPermissionsAsync();
      if (!active) {
        return;
      }
      if (!permission.granted && permission.canAskAgain) {
        permission = await requestForegroundPermissionsAsync();
        if (!active) {
          return;
        }
      }
      if (!permission.granted) {
        dispatch({ type: 'denied', canAskAgain: permission.canAskAgain });
        return;
      }
      // With approximate location the phone only knows roughly where it is, which is no use for
      // finding the same plant again.
      if (permission.ios?.accuracy === 'reduced' || permission.android?.accuracy === 'coarse') {
        dispatch({ type: 'approximate' });
        return;
      }

      const servicesOn = await hasServicesEnabledAsync();
      if (!active) {
        return;
      }
      if (!servicesOn) {
        dispatch({ type: 'services-off' });
        return;
      }

      dispatch({ type: 'searching' });
      // Fixes can arrive before this promise resolves, so the callbacks check `active` too.
      const watcher = await watchPositionAsync(
        WATCH_OPTIONS,
        (location) => {
          if (active) {
            dispatch({ type: 'location', location });
          }
        },
        () => {
          if (active) {
            dispatch({ type: 'error' });
          }
        },
      );
      if (active) {
        subscription = watcher;
      } else {
        watcher.remove();
      }
    }

    watch().catch(() => {
      if (active) {
        dispatch({ type: 'error' });
      }
    });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [locating]);

  // Gives up on the first fix after a few minutes, and stops improving after 30 seconds.
  useEffect(() => {
    if (state.status !== 'searching' && state.status !== 'improving') {
      return;
    }
    const timer =
      state.status === 'searching'
        ? setTimeout(() => dispatch({ type: 'no-fix' }), FIRST_FIX_TIMEOUT_MS)
        : setTimeout(() => dispatch({ type: 'settle' }), IMPROVE_FOR_MS);
    return () => clearTimeout(timer);
  }, [state.status]);

  return {
    status: state.status,
    location: state.saved,
    best: state.best,
    locating,
    canAskAgain: state.canAskAgain,
    start: () => dispatch({ type: 'start', at: Date.now() }),
    cancel: () => dispatch({ type: 'cancel' }),
    accept: () => dispatch({ type: 'accept' }),
    clear: () => dispatch({ type: 'clear' }),
  };
}

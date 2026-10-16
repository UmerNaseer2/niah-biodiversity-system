import { useEffect } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { LocationSummary } from '@/components/location-summary';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import type { GpsCapture } from '@/hooks/use-gps-capture';
import { useTheme } from '@/hooks/use-theme';
import { GOOD_ACCURACY_M } from '@/lib/format';
import { IMPROVE_FOR_MS, type GpsStatus } from '@/lib/gps';

// The browser has no settings page to send people to.
const CAN_OPEN_SETTINGS = Platform.OS !== 'web';

/** What went wrong and what to do about it, or undefined when nothing did. */
function problemMessage(status: GpsStatus, canAskAgain: boolean) {
  switch (status) {
    case 'denied':
      return canAskAgain
        ? 'The app needs location access to record where the plant is.'
        : 'Location access is off for this app. Turn it on in Settings, then try again.';
    case 'approximate':
      return (
        'The phone is only sharing an approximate location. Turn on precise location for this ' +
        'app in Settings, then try again.'
      );
    case 'services-off':
      return 'Location is turned off on this phone. Turn it on in Settings, then try again.';
    case 'no-fix':
      return (
        "Couldn't get a GPS fix. Move to a clearer spot, away from cliffs and thick canopy, " +
        'and try again.'
      );
    case 'error':
      return 'Something went wrong getting the location. Please try again.';
    default:
      return undefined;
  }
}

function openSettings() {
  // If Settings won't open there's nothing else to try, and the message already says what to do.
  Linking.openSettings().catch(() => undefined);
}

/** The Location card on the New Record form: capturing, progress, problems and the result. */
export function LocationCapture({ gps }: { gps: GpsCapture }) {
  const theme = useTheme();
  const { status, location, best, canAskAgain } = gps;
  const problem = problemMessage(status, canAskAgain);
  const needsSettings =
    CAN_OPEN_SETTINGS && ((status === 'denied' && !canAskAgain) || status === 'approximate');

  let announcement = problem;
  if (status === 'done' && location) {
    announcement = `Location captured, accurate to about ${location.accuracyM} metres.`;
  }

  // Captures take a while, so screen reader users hear how it went without hunting for it.
  // On the web the role="alert" below does the same job for problems.
  useEffect(() => {
    if (announcement && Platform.OS !== 'web') {
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [announcement]);

  if (status === 'idle') {
    return (
      <>
        <ThemedText themeColor="textSecondary">
          Stand next to the plant, then capture. GPS works without phone signal.
        </ThemedText>
        <Button label="Capture location" icon="location" variant="secondary" onPress={gps.start} />
      </>
    );
  }

  if (status === 'done' && location) {
    return (
      <>
        <LocationSummary location={location} showRetakeTip />
        <Button label="Retake location" icon="location" variant="outline" onPress={gps.start} />
      </>
    );
  }

  if (gps.locating) {
    let progress = 'Getting ready…';
    let detail: string | undefined;
    if (status === 'searching') {
      progress = 'Looking for GPS satellites…';
      detail =
        'The first fix can take a few minutes without phone signal. Stay out in the open if ' +
        'you can.';
    } else if (status === 'improving') {
      progress = 'Improving the fix…';
      detail =
        `It stops at ${GOOD_ACCURACY_M} m or better, or after ${IMPROVE_FOR_MS / 1000} seconds. ` +
        'You can use this one now if it looks good enough.';
    }

    return (
      <>
        {status === 'improving' && best ? <LocationSummary location={best} /> : null}
        <View style={styles.progress}>
          <ActivityIndicator color={theme.primary} />
          <View style={styles.progressText}>
            <ThemedText type="smallBold">{progress}</ThemedText>
            {detail ? (
              <ThemedText type="small" themeColor="textSecondary">
                {detail}
              </ThemedText>
            ) : null}
          </View>
        </View>
        <View style={styles.buttons}>
          {status === 'improving' && best ? (
            <Button label="Use this location" variant="secondary" onPress={gps.accept} />
          ) : null}
          <Button label="Cancel" variant="outline" onPress={gps.cancel} />
        </View>
      </>
    );
  }

  // Something went wrong. A location from before is still kept, so show it too.
  return (
    <>
      {location ? <LocationSummary location={location} /> : null}
      <View style={[styles.problem, { backgroundColor: theme.warningSoft }]}>
        <Icon name="warning" size={18} color={theme.warning} />
        <View style={styles.progressText}>
          <ThemedText type="small" themeColor="warning" role="alert">
            {problem}
          </ThemedText>
          {location ? (
            <ThemedText type="small" themeColor="warning">
              The location you captured before is still kept.
            </ThemedText>
          ) : null}
        </View>
      </View>
      <View style={styles.buttons}>
        {needsSettings ? (
          <Button label="Open Settings" icon="settings" variant="secondary" onPress={openSettings} />
        ) : null}
        <Button
          label="Try again"
          icon="location"
          variant={needsSettings ? 'outline' : 'secondary'}
          onPress={gps.start}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressText: {
    flex: 1,
    gap: Spacing.one,
  },
  problem: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: 12,
    borderRadius: Radius.md,
  },
  buttons: {
    gap: Spacing.two,
  },
});

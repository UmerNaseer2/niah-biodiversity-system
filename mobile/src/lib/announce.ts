import { AccessibilityInfo, Platform } from 'react-native';

/** Reads a message out on a phone. On the web a role="alert" on the message does the same job. */
export function announce(message: string) {
  if (Platform.OS !== 'web') {
    AccessibilityInfo.announceForAccessibility(message);
  }
}

import {
  CameraView,
  PermissionStatus,
  useCameraPermissions,
  type BarcodeSettings,
} from 'expo-camera';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// The camera box stays dark in both themes so it looks like a camera feed.
const VIEWFINDER_BACKGROUND = '#0B120D';
const VIEWFINDER_FOREGROUND = '#FFFFFF';
const CORNER_INSET = 20;

// Plant tags only have QR codes on them, so the camera doesn't look for any other kind.
const QR_ONLY: BarcodeSettings = { barcodeTypes: ['qr'] };

// The browser has no settings page to send people to, and can't turn on the torch.
const IS_WEB = Platform.OS === 'web';

const CAMERA_FAILED = "The camera couldn't start. Try again, or type the tag code below.";

function openSettings() {
  // If Settings won't open there's nothing else to try, and the message already says what to do.
  Linking.openSettings().catch(() => undefined);
}

type QrScannerProps = {
  /** Gets the text of every QR code the camera sees. It's called many times a second. */
  onScan: (data: string) => void;
  /** Called when the camera has started. */
  onReady?: () => void;
  /** What went wrong with the last scan, shown under the camera. */
  problem?: string;
};

/**
 * The camera box on the Scan tab. It asks for camera access, shows the camera while the tab is
 * open and passes on every QR code it sees.
 */
export function QrScanner({ onScan, onReady, problem }: QrScannerProps) {
  const theme = useTheme();
  const isFocused = useIsFocused();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [failed, setFailed] = useState(false);

  // Camera access can be changed in Settings while the app is in the background, so check it
  // again when the app comes back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        getPermission().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [getPermission]);

  // Leaving the tab turns the torch off and gives the camera a fresh start next time.
  useFocusEffect(
    useCallback(
      () => () => {
        setTorchOn(false);
        setFailed(false);
      },
      [],
    ),
  );

  function handleMountError() {
    setFailed(true);
    if (!IS_WEB) {
      AccessibilityInfo.announceForAccessibility(CAMERA_FAILED);
    }
  }

  if (!permission) {
    return (
      <View style={[styles.box, styles.square, styles.loading]}>
        <ActivityIndicator color={VIEWFINDER_FOREGROUND} />
        <ThemedText style={styles.text}>Checking camera access…</ThemedText>
      </View>
    );
  }

  if (!permission.granted) {
    // A browser always says it can ask again, so "denied" there means the site is blocked.
    const blocked =
      !permission.canAskAgain || (IS_WEB && permission.status === PermissionStatus.DENIED);

    if (blocked) {
      return (
        <View style={[styles.box, styles.message]}>
          <Icon name="camera" size={40} color={VIEWFINDER_FOREGROUND} />
          <ThemedText role="alert" style={styles.text}>
            {IS_WEB
              ? "Camera access is blocked for this site. Allow it in the browser's site " +
                'settings, then reload the page.'
              : 'Camera access is off for this app. Turn it on in Settings, then come back here.'}
          </ThemedText>
          {IS_WEB ? null : <Button label="Open Settings" icon="settings" onPress={openSettings} />}
        </View>
      );
    }

    return (
      <View style={[styles.box, styles.message]}>
        <Icon name="camera" size={40} color={VIEWFINDER_FOREGROUND} />
        <ThemedText style={styles.text}>
          The app needs the camera to read the QR tag on each plant.
        </ThemedText>
        <Button
          label="Allow camera"
          icon="camera"
          onPress={() => requestPermission().catch(() => undefined)}
        />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={[styles.box, styles.message]}>
        <Icon name="warning" size={40} color={VIEWFINDER_FOREGROUND} />
        <ThemedText role="alert" style={styles.text}>
          {CAMERA_FAILED}
        </ThemedText>
        <Button label="Try again" icon="camera" onPress={() => setFailed(false)} />
      </View>
    );
  }

  return (
    <>
      <View
        accessible
        aria-label="Camera. Point it at the QR tag on the plant."
        style={[styles.box, styles.square]}>
        {/* Only one camera can run at a time, and it drains the battery, so it's only on while
            this tab is in front. Don't set autofocus. Its default keeps refocusing as the phone
            moves, and 'on' focuses once then locks. */}
        {isFocused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={QR_ONLY}
            onBarcodeScanned={({ data }) => onScan(data)}
            onMountError={handleMountError}
            onCameraReady={onReady}
            enableTorch={torchOn}
          />
        ) : null}
        <View style={[styles.corner, styles.topLeft]} />
        <View style={[styles.corner, styles.topRight]} />
        <View style={[styles.corner, styles.bottomLeft]} />
        <View style={[styles.corner, styles.bottomRight]} />
      </View>

      {problem ? (
        <View style={[styles.problem, { backgroundColor: theme.warningSoft }]}>
          <Icon name="warning" size={18} color={theme.warning} />
          <ThemedText type="small" themeColor="warning" role="alert" style={styles.problemText}>
            {problem}
          </ThemedText>
        </View>
      ) : null}

      {IS_WEB ? null : (
        <Button
          label={torchOn ? 'Turn torch off' : 'Turn torch on'}
          icon="torch"
          variant="outline"
          onPress={() => setTorchOn((on) => !on)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: VIEWFINDER_BACKGROUND,
  },
  square: {
    aspectRatio: 1,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  // Messages can grow taller than the square when the phone uses large text.
  message: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  text: {
    color: VIEWFINDER_FOREGROUND,
    textAlign: 'center',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: VIEWFINDER_FOREGROUND,
  },
  topLeft: {
    top: CORNER_INSET,
    left: CORNER_INSET,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: Radius.md,
  },
  topRight: {
    top: CORNER_INSET,
    right: CORNER_INSET,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: Radius.md,
  },
  bottomLeft: {
    bottom: CORNER_INSET,
    left: CORNER_INSET,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: Radius.md,
  },
  bottomRight: {
    bottom: CORNER_INSET,
    right: CORNER_INSET,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: Radius.md,
  },
  problem: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: 12,
    borderRadius: Radius.md,
  },
  problemText: {
    flex: 1,
  },
});

import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { PhotoGrid, PhotoThumb } from '@/components/photo-thumb';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { MAX_PHOTOS, type PhotoCapture as PhotoCaptureState } from '@/hooks/use-photo-capture';
import { useTheme } from '@/hooks/use-theme';

// The website version of the app is only for looking at screens.
const IS_WEB = Platform.OS === 'web';

function openSettings() {
  // If Settings won't open there's nothing else to try, and the message already says what to do.
  Linking.openSettings().catch(() => undefined);
}

/** The Photos card on the New Record form. */
export function PhotoCapture({ photos }: { photos: PhotoCaptureState }) {
  const theme = useTheme();
  const { paths, busy, problem, needsSettings } = photos;

  if (IS_WEB) {
    return (
      <ThemedText themeColor="textSecondary">Photos can only be taken in the phone app.</ThemedText>
    );
  }

  return (
    <>
      {paths.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          Photos stay on this phone with the record, and go up after it when you have signal. You
          can add up to {MAX_PHOTOS}.
        </ThemedText>
      ) : (
        <PhotoGrid>
          {paths.map((path, index) => (
            <PhotoThumb key={path} path={path} label={`Photo ${index + 1}`}>
              <Pressable
                role="button"
                aria-label={`Remove photo ${index + 1}`}
                hitSlop={8}
                onPress={() => photos.remove(path)}
                style={[styles.remove, { backgroundColor: theme.background }]}>
                <Icon name="close" size={16} color={theme.text} />
              </Pressable>
            </PhotoThumb>
          ))}
        </PhotoGrid>
      )}
      {problem ? (
        <View style={[styles.problem, { backgroundColor: theme.warningSoft }]}>
          <Icon name="warning" size={18} color={theme.warning} />
          <ThemedText type="small" themeColor="warning" role="alert" style={styles.problemText}>
            {problem}
          </ThemedText>
        </View>
      ) : null}
      {needsSettings ? (
        <Button label="Open Settings" icon="settings" variant="secondary" onPress={openSettings} />
      ) : null}
      {paths.length < MAX_PHOTOS ? (
        <View style={styles.buttons}>
          <Button
            label="Take photo"
            icon="camera"
            variant="secondary"
            onPress={photos.takePhoto}
            disabled={busy}
          />
          <Button
            label="Choose from library"
            icon="library"
            variant="outline"
            onPress={photos.choosePhotos}
            disabled={busy}
          />
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          That&apos;s the most a record can have. Remove one to add another.
        </ThemedText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
  buttons: {
    gap: Spacing.two,
  },
});

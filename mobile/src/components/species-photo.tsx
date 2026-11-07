import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { speciesPhotoUri } from '@/lib/species-photo-files';
import type { PublicPhoto } from '@/types/public-copy';

type SpeciesPhotoProps = {
  /** The species' main photo, if it has one. */
  photo?: PublicPhoto;
  /** What the plant is called, for a photo with no caption. */
  name: string;
};

/**
 * A species' main photo with its caption and credit, like on the website. It only shows once the
 * photo has come down to the phone, so it works with no signal.
 */
export function SpeciesPhoto({ photo, name }: SpeciesPhotoProps) {
  const theme = useTheme();
  if (!photo?.file) {
    return null;
  }
  const caption = photo.caption.trim();
  const credit = photo.credit.trim();
  return (
    <View style={styles.figure}>
      <View style={[styles.frame, { backgroundColor: theme.primarySoft }]}>
        <Image
          source={{ uri: speciesPhotoUri(photo.file) }}
          style={styles.image}
          contentFit="cover"
          // Memory only, because the file is on the phone already and a copy on disk would stay
          // behind after the photo changes.
          cachePolicy="memory"
          accessible
          accessibilityLabel={caption || `A photo of ${name}`}
        />
      </View>
      {caption || credit ? (
        <ThemedText type="small" themeColor="textSecondary">
          {caption ? <ThemedText type="small">{caption}</ThemedText> : null}
          {caption && credit ? ' ' : null}
          {credit ? `Photo: ${credit}` : null}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  figure: {
    gap: Spacing.two,
  },
  frame: {
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
  },
});

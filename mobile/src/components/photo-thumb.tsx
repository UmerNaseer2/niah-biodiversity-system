import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { photoUri } from '@/lib/photo-files';

/** Lays out a set of PhotoThumb. */
export function PhotoGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** A square photo from the phone. Works with no signal, because the file is on the phone. */
export function PhotoThumb({
  path,
  label,
  children,
}: {
  path: string;
  /** What a screen reader says for the photo. */
  label: string;
  /** Anything to sit on top of the photo. */
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
      <Image
        source={{ uri: photoUri(path) }}
        style={styles.image}
        contentFit="cover"
        // Not on disk, or expo-image keeps a full copy in its cache after the record is deleted.
        cachePolicy="memory"
        accessibilityLabel={label}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
  },
});

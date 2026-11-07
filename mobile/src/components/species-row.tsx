import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { IucnChip, ProtectedChip } from '@/components/ui/plant-chips';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plural } from '@/lib/format';
import { IUCN } from '@/lib/iucn';
import type { PlantSummary } from '@/lib/species-list';
import { speciesPhotoUri } from '@/lib/species-photo-files';
import type { PublicPhoto } from '@/types/public-copy';

type SpeciesRowProps = {
  plant: PlantSummary;
  /** The species' main photo, if it has one. */
  photo?: PublicPhoto;
};

/** One species on the Plants tab. It opens the species page. */
export function SpeciesRow({ plant, photo }: SpeciesRowProps) {
  const theme = useTheme();
  const { species, name, otherNames, tagged } = plant;
  const hasCommonName = species.commonNames.length > 0;
  const family = species.family.trim();
  const taggedText = tagged > 0 ? plural(tagged, 'tagged plant') : 'No tagged plants yet';
  // Screen readers read the row out in one go.
  const label = [
    name,
    hasCommonName ? species.scientificName : undefined,
    family ? `${family} family` : undefined,
    `IUCN status: ${IUCN[species.iucnCode].label}`,
    species.sarawakProtected ? 'protected in Sarawak' : undefined,
    taggedText,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Link href={{ pathname: '/species/[slug]', params: { slug: species.slug } }} asChild>
      <Pressable aria-label={label} style={styles.pressable}>
        {({ pressed }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            {photo?.file ? (
              <Image
                source={{ uri: speciesPhotoUri(photo.file) }}
                style={[styles.thumb, { backgroundColor: theme.primarySoft }]}
                contentFit="cover"
                // Memory only, because the file is on the phone already and a copy on disk would
                // stay behind after the photo changes.
                cachePolicy="memory"
              />
            ) : (
              <View
                style={[styles.thumb, styles.placeholder, { backgroundColor: theme.primarySoft }]}>
                <Icon name="leaf" size={24} color={theme.primary} />
              </View>
            )}
            <View style={styles.body}>
              <ThemedText type="heading" style={!hasCommonName && styles.italic}>
                {name}
              </ThemedText>
              {hasCommonName || family ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {hasCommonName ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.italic}>
                      {species.scientificName}
                    </ThemedText>
                  ) : null}
                  {hasCommonName && family ? ' · ' : null}
                  {family}
                </ThemedText>
              ) : null}
              {otherNames.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Also called {otherNames.join(', ')}
                </ThemedText>
              ) : null}
              <View style={styles.chips}>
                <IucnChip code={species.iucnCode} />
                {species.sarawakProtected ? <ProtectedChip /> : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {taggedText}
              </ThemedText>
            </View>
            <Icon name="chevron" size={16} color={theme.textSecondary} />
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: Radius.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  pressed: {
    opacity: 0.8,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  italic: {
    fontStyle: 'italic',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.one,
  },
});

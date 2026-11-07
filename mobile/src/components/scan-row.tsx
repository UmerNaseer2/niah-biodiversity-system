import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRecordedAt } from '@/lib/format';
import { hasCommonName, plantName } from '@/lib/plant-info';
import type { PublicRecord, PublicSpecies, ScanEntry } from '@/types/public-copy';

type ScanRowProps = {
  scan: ScanEntry;
  /** The tagged plant, or nothing when the plant info doesn't have this tag yet. */
  plant?: PublicRecord;
  species?: PublicSpecies;
  now: Date;
};

/** One tag in History. It opens the plant page, which also says when there's no info yet. */
export function ScanRow({ scan, plant, species, now }: ScanRowProps) {
  const theme = useTheme();
  const scannedAt = formatRecordedAt(scan.scannedAt, now);
  const name = plant ? plantName(plant, species) : `Tag ${scan.tagCode}`;
  const label = [name, plant ? `tag ${scan.tagCode}` : 'no plant info yet', scannedAt].join(', ');

  // Link's asChild drops style functions and style arrays on the Pressable, so the pressed
  // look goes on the inner View instead.
  return (
    <Link href={{ pathname: '/plant/[tag]', params: { tag: scan.tagCode } }} asChild>
      <Pressable aria-label={label} style={styles.pressable}>
        {({ pressed }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
              <Icon name={plant ? 'leaf' : 'qr'} size={20} color={theme.primary} />
            </View>
            <View style={styles.body}>
              <ThemedText
                type="heading"
                numberOfLines={1}
                style={plant && !hasCommonName(plant, species) && styles.italic}>
                {name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {plant ? `${scan.tagCode} · ${scannedAt}` : `No plant info yet · ${scannedAt}`}
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
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
});

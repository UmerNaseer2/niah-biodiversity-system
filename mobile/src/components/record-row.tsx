import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { SyncTag } from '@/components/ui/sync-badge';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRecordedAt } from '@/lib/format';
import type { PlantRecord } from '@/types/plant-record';

export function RecordRow({ record }: { record: PlantRecord }) {
  const theme = useTheme();
  const recordedAt = formatRecordedAt(record.recordedAt);
  const label = [
    record.speciesName,
    record.commonName,
    `tag ${record.tagCode}`,
    record.syncStatus === 'pending' ? 'pending sync' : 'synced',
    recordedAt,
  ]
    .filter(Boolean)
    .join(', ');

  // Link's asChild drops style functions and style arrays on the Pressable, so the pressed
  // look goes on the inner View instead.
  return (
    <Link href={{ pathname: '/record/[id]', params: { id: record.id } }} asChild>
      <Pressable aria-label={label} style={styles.pressable}>
        {({ pressed }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <View style={[styles.leaf, { backgroundColor: theme.primarySoft }]}>
              <Icon name="leaf" size={20} color={theme.primary} />
            </View>
            <View style={styles.body}>
              <ThemedText type="heading" numberOfLines={1} style={styles.species}>
                {record.speciesName}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {record.commonName ? `${record.commonName} · ${record.tagCode}` : record.tagCode}
              </ThemedText>
              <View style={styles.meta}>
                <SyncTag status={record.syncStatus} />
                <ThemedText type="small" themeColor="textSecondary">
                  {recordedAt}
                </ThemedText>
              </View>
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
  leaf: {
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
  species: {
    fontStyle: 'italic',
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.two,
    rowGap: Spacing.one,
    marginTop: Spacing.one,
  },
});

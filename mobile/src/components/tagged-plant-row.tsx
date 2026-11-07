import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { conditionLabel, formatParkDate } from '@/lib/format';
import type { PublicRecord } from '@/types/public-copy';

/** A tagged plant on a species page, like the list on the website. It opens the plant page. */
export function TaggedPlantRow({ record }: { record: PublicRecord }) {
  const theme = useTheme();
  const parts = [
    record.heightM !== undefined ? `${record.heightM} m tall` : 'Height not measured',
    `recorded ${formatParkDate(record.recordedAt)}`,
    record.condition ? conditionLabel(record.condition) : undefined,
  ].filter(Boolean);
  const label = [`Tag ${record.tagCode}`, ...parts].join(', ');

  return (
    <Link href={{ pathname: '/plant/[tag]', params: { tag: record.tagCode } }} asChild>
      <Pressable aria-label={label} style={styles.pressable}>
        {({ pressed }) => (
          <View
            style={[styles.row, { backgroundColor: theme.background }, pressed && styles.pressed]}>
            <View style={styles.body}>
              <ThemedText style={styles.code}>{record.tagCode}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {parts.join(' · ')}
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
    borderRadius: Radius.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    padding: 12,
    borderRadius: Radius.md,
  },
  pressed: {
    opacity: 0.8,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: 700,
  },
});

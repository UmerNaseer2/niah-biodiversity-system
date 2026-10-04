import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChipProps = {
  label: string;
  selected: boolean;
  count?: number;
  onPress: () => void;
};

/** One option in a ChipRow. Works like a radio button, so only one chip in a row is selected. */
export function Chip({ label, selected, count, onPress }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-label={count === undefined ? label : `${label}, ${count}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: theme.primary, borderColor: theme.primary }
          : { backgroundColor: theme.backgroundElement, borderColor: theme.outline },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>
        {count === undefined ? label : `${label} · ${count}`}
      </ThemedText>
    </Pressable>
  );
}

type ChipRowProps = {
  label: string;
  /** Show the label above the chips. It is always read out by screen readers either way. */
  showLabel?: boolean;
  children: ReactNode;
};

export function ChipRow({ label, showLabel, children }: ChipRowProps) {
  return (
    <View style={styles.group}>
      {showLabel ? (
        <ThemedText type="smallBold" aria-hidden>
          {label}
        </ThemedText>
      ) : null}
      <View role="radiogroup" aria-label={label} style={styles.row}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  group: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});

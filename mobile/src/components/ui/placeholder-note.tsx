import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PlaceholderNoteProps = {
  /** Sprint backlog item that replaces this placeholder. */
  item: number;
  children: string;
};

/** Marks the parts of a screen that are still mock ups, so testers know what is not real yet. */
export function PlaceholderNote({ item, children }: PlaceholderNoteProps) {
  const theme = useTheme();

  return (
    <View style={[styles.note, { borderColor: theme.border }]}>
      <ThemedText type="overline" themeColor="primary">
        Coming in item {item}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    padding: 12,
    gap: Spacing.one,
  },
});

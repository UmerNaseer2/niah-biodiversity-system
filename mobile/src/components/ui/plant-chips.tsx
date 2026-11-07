import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { IUCN, IUCN_SWATCH } from '@/lib/iucn';
import type { IucnCode } from '@/types/public-copy';

/** A species' Red List status as the website shows it: the code in its colour, then the name. */
export function IucnChip({ code }: { code: IucnCode }) {
  const theme = useTheme();
  const swatch = IUCN_SWATCH[code];

  // Read out as one label, since the code on its own means little when it's spoken.
  return (
    <View
      accessible
      aria-label={`IUCN status: ${IUCN[code].label}`}
      style={[
        styles.chip,
        styles.iucnChip,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <View
        style={[
          styles.swatch,
          { backgroundColor: swatch.background },
          swatch.outlined && { borderColor: theme.outline, borderWidth: 1 },
        ]}>
        <ThemedText style={[styles.code, { color: swatch.text }]}>{code}</ThemedText>
      </View>
      <ThemedText type="smallBold">{IUCN[code].label}</ThemedText>
    </View>
  );
}

/** The website's "Protected in Sarawak" badge, the same size as the IUCN chip next to it. */
export function ProtectedChip() {
  const theme = useTheme();

  return (
    <View
      accessible
      style={[
        styles.chip,
        styles.protectedChip,
        { backgroundColor: theme.primarySoft, borderColor: theme.primarySoft },
      ]}>
      <Icon name="leaf" size={14} color={theme.primary} />
      <ThemedText type="smallBold" themeColor="primary">
        Protected in Sarawak
      </ThemedText>
    </View>
  );
}

// The side padding is set on each chip and not here, because paddingLeft and paddingRight win
// over paddingHorizontal whichever style comes last.
const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: Spacing.half,
    borderWidth: 1,
    borderRadius: Radius.sm,
  },
  iucnChip: {
    gap: 6,
    paddingLeft: Spacing.half,
    paddingRight: Spacing.two,
  },
  protectedChip: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  swatch: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 700,
  },
});

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Pill } from '@/components/ui/pill';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { accuracyLevel, formatCoords, formatTime } from '@/lib/format';
import type { GpsReading } from '@/types/plant-record';

const LEVELS = {
  good: { tone: 'success', label: 'Good' },
  ok: { tone: 'warning', label: 'OK' },
  poor: { tone: 'danger', label: 'Poor' },
} as const;

type LocationSummaryProps = {
  location: GpsReading;
  /** Show the "retake" tip when accuracy is poor. Only makes sense where there is a retake button. */
  showRetakeTip?: boolean;
};

export function LocationSummary({ location, showRetakeTip }: LocationSummaryProps) {
  const theme = useTheme();
  const level = accuracyLevel(location.accuracyM);

  return (
    <View style={styles.summary}>
      <ThemedText type="heading" selectable style={styles.coords}>
        {formatCoords(location)}
      </ThemedText>
      <View style={styles.meta}>
        <Pill
          tone={LEVELS[level].tone}
          label={`±${location.accuracyM} m · ${LEVELS[level].label}`}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Captured {formatTime(location.capturedAt)}
        </ThemedText>
      </View>
      {showRetakeTip && level === 'poor' ? (
        <View style={[styles.tip, { backgroundColor: theme.warningSoft }]}>
          <Icon name="warning" size={18} color={theme.warning} />
          <ThemedText type="small" themeColor="warning" style={styles.tipText}>
            Accuracy is low. Move away from thick canopy if you can, then retake.
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: Spacing.two,
  },
  coords: {
    fontVariant: ['tabular-nums'],
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  tip: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: 12,
    borderRadius: Radius.md,
  },
  tipText: {
    flex: 1,
  },
});

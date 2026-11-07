import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoRow } from '@/components/ui/info-row';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { formatRecordedAt } from '@/lib/format';
import { usePublicCopy } from '@/state/public-copy-context';
import { useRecords } from '@/state/records-context';
import { downloadMessage } from '@/sync/public-copy';

/** The Home tab for visitors. Scanning a tag is the main thing they do, so it comes first. */
export function VisitorHome() {
  const router = useRouter();

  return (
    <Screen
      eyebrow="Niah National Park"
      title="Plant guide"
      subtitle="Scan the QR tag on a plant to read about it.">
      <Button label="Scan a plant tag" icon="scan" onPress={() => router.navigate('/scan')} />
      <OfflineCard />
    </Screen>
  );
}

/** How many plants can be looked up with no signal, or how getting them ready is going. */
export function OfflineCard() {
  const { publicRecords, publicCopyAt } = useRecords();
  const { updateNow, running, lastOutcome, canUpdate } = usePublicCopy();
  // Changes when the app comes back to the front, which redraws the "Today" on Last updated.
  const now = useNow();
  const theme = useTheme();

  if (publicCopyAt) {
    // While a download runs, the copy already here still works, so there's nothing extra to say.
    const count = publicRecords.length;
    const plants = count === 1 ? 'tagged plant' : 'tagged plants';
    return (
      <Card>
        <View style={styles.ready}>
          <ThemedText type="overline" themeColor="textSecondary">
            Ready offline
          </ThemedText>
          <View accessible aria-label={`${count} ${plants} ready offline`} style={styles.countRow}>
            <ThemedText themeColor="primary" style={styles.count}>
              {count}
            </ThemedText>
            <ThemedText type="heading">{plants}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {count === 0
              ? "The park hasn't added any tagged plants yet."
              : 'You can scan their tags with no signal.'}
          </ThemedText>
        </View>
        <InfoRow label="Last updated" value={formatRecordedAt(publicCopyAt, now)} />
      </Card>
    );
  }

  if (!canUpdate) {
    return (
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Downloading plant info isn&apos;t set up in this build.
        </ThemedText>
      </Card>
    );
  }

  // The first download starts as soon as this shows, so having no outcome yet means it's coming.
  if (running || lastOutcome === null) {
    return (
      <Card>
        <View style={styles.getting}>
          <ActivityIndicator color={theme.primary} />
          <ThemedText style={styles.gettingText}>
            Getting plant info ready for offline use...
          </ThemedText>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <ThemedText type="small" themeColor="textSecondary">
        {downloadMessage(lastOutcome, false)}
      </ThemedText>
      <Button label="Try again" icon="sync" variant="outline" onPress={updateNow} />
    </Card>
  );
}

const styles = StyleSheet.create({
  ready: {
    gap: Spacing.one,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  count: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  getting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gettingText: {
    flex: 1,
  },
});

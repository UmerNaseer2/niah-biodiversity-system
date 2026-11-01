import { Link, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { RecordRow } from '@/components/record-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { isToday } from '@/lib/format';
import { useRecords } from '@/state/records-context';

export default function HomeScreen() {
  const router = useRouter();
  const { records, pendingCount, waitingPhotoCount, photoProblemCount } = useRecords();
  // Changes when the app comes back to the front, which also redraws the "Today" and "Yesterday"
  // on the recent records below.
  const now = useNow();
  const today = records.filter((record) => isToday(record.recordedAt, now));
  const todayPending = today.filter((record) => record.syncStatus === 'pending').length;
  const todaySynced = today.filter((record) => record.syncStatus === 'synced').length;
  const plantsRecorded = today.length === 1 ? 'plant recorded' : 'plants recorded';

  return (
    <Screen eyebrow="Niah National Park" title="Ground-truthing">
      <SyncBadge
        pending={pendingCount}
        total={records.length}
        photos={waitingPhotoCount + photoProblemCount}
      />

      <Card>
        <View style={styles.today}>
          <ThemedText type="overline" themeColor="textSecondary">
            Today
          </ThemedText>
          <View
            accessible
            aria-label={`${today.length} ${plantsRecorded} today`}
            style={styles.countRow}>
            <ThemedText themeColor="primary" style={styles.count}>
              {today.length}
            </ThemedText>
            <ThemedText type="heading">{plantsRecorded}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {today.length > 0
              ? `${todayPending} waiting to sync · ${todaySynced} synced`
              : 'Nothing recorded yet today. Scan a tag or start a new record.'}
          </ThemedText>
        </View>
      </Card>

      <View style={styles.actions}>
        <Button label="Scan a tag" icon="scan" onPress={() => router.navigate('/scan')} />
        <Button
          label="New plant record"
          icon="newRecord"
          variant="secondary"
          onPress={() => router.navigate('/new-record')}
        />
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle" role="heading">
          Recent records
        </ThemedText>
        <Link href="/records" asChild>
          <Pressable aria-label="See all records" hitSlop={8} style={styles.seeAll}>
            <ThemedText type="smallBold" themeColor="primary">
              See all
            </ThemedText>
          </Pressable>
        </Link>
      </View>

      {records.length > 0 ? (
        <View style={styles.list}>
          {records.slice(0, 3).map((record) => (
            <RecordRow key={record.id} record={record} />
          ))}
        </View>
      ) : (
        <ThemedText themeColor="textSecondary">No records on this phone yet.</ThemedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  today: {
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
  actions: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  seeAll: {
    minHeight: 44,
    justifyContent: 'center',
  },
  list: {
    gap: 12,
  },
});

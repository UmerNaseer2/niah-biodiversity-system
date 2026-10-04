import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RecordRow } from '@/components/record-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { PlaceholderNote } from '@/components/ui/placeholder-note';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plural } from '@/lib/format';
import { useRecords } from '@/state/records-context';
import type { SyncStatus } from '@/types/plant-record';

type Filter = 'all' | SyncStatus;

const FILTERS: { value: Filter; label: string; empty: string }[] = [
  { value: 'all', label: 'All', empty: 'No records on this phone yet.' },
  { value: 'pending', label: 'Pending', empty: 'Nothing waiting to sync.' },
  { value: 'synced', label: 'Synced', empty: 'Nothing synced yet.' },
];

export default function RecordsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { records, pendingCount } = useRecords();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = {
    all: records.length,
    pending: pendingCount,
    synced: records.length - pendingCount,
  };
  const shown =
    filter === 'all' ? records : records.filter((record) => record.syncStatus === filter);
  const emptyText = FILTERS.find((option) => option.value === filter)?.empty;

  return (
    <Screen title="My records" subtitle={`${plural(records.length, 'record')} on this phone`}>
      {pendingCount > 0 ? (
        <View style={[styles.banner, { backgroundColor: theme.warningSoft }]}>
          <View style={styles.bannerTitle}>
            <Icon name="pending" size={20} color={theme.warning} />
            <ThemedText type="heading" themeColor="warning" role="heading" style={styles.flex}>
              {plural(pendingCount, 'record')} waiting to sync
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="warning">
            They are saved on this phone and safe to leave until you have signal. Uploading
            comes in item 10.
          </ThemedText>
          <Button label="Sync now" icon="sync" variant="outline" disabled />
        </View>
      ) : null}

      <ChipRow label="Filter records">
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            count={counts[option.value]}
            selected={filter === option.value}
            onPress={() => setFilter(option.value)}
          />
        ))}
      </ChipRow>

      {/* A plain map is fine for a few records. Item 9 should switch to a FlatList once
          records come from SQLite and the list can get long. */}
      {shown.length > 0 ? (
        <View style={styles.list}>
          {shown.map((record) => (
            <RecordRow key={record.id} record={record} />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary">{emptyText}</ThemedText>
          {records.length === 0 ? (
            <Button
              label="New plant record"
              icon="newRecord"
              variant="secondary"
              onPress={() => router.navigate('/new-record')}
            />
          ) : null}
        </View>
      )}

      <PlaceholderNote item={9}>
        Records only live in memory for now, so they reset when the app restarts. This item saves
        them in SQLite on the phone so nothing is lost without signal.
      </PlaceholderNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: 12,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  bannerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  list: {
    gap: 12,
  },
  empty: {
    gap: 12,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});

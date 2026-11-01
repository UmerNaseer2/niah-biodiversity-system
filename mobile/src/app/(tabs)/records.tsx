import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RecordRow } from '@/components/record-row';
import { ListScreen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { SyncBanner } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
import { plural } from '@/lib/format';
import { useAccount } from '@/state/account-context';
import { useRecords } from '@/state/records-context';
import { useSync } from '@/state/sync-context';
import type { SyncStatus } from '@/types/plant-record';

type Filter = 'all' | SyncStatus;

const FILTERS: { value: Filter; label: string; empty: string }[] = [
  { value: 'all', label: 'All', empty: 'No records on this phone yet.' },
  { value: 'pending', label: 'Pending', empty: 'Nothing waiting to sync.' },
  { value: 'synced', label: 'Synced', empty: 'Nothing synced yet.' },
];

export default function RecordsScreen() {
  const router = useRouter();
  const {
    records,
    pendingCount,
    syncedCount,
    waitingPhotoCount,
    photoProblemCount,
    photosWaitingFor,
  } = useRecords();
  const { status, account } = useAccount();
  const { syncNow, running, message } = useSync();
  // Records the server turned down are still pending, but they won't go up by waiting for signal.
  const problemCount = records.filter((record) => record.uploadProblem).length;
  const photosWaiting = photosWaitingFor(account?.userId);
  const [filter, setFilter] = useState<Filter>('all');

  const counts = {
    all: records.length,
    pending: pendingCount,
    synced: syncedCount,
  };
  const shown =
    filter === 'all' ? records : records.filter((record) => record.syncStatus === filter);
  const emptyText = FILTERS.find((option) => option.value === filter)?.empty;

  return (
    <ListScreen
      title="My records"
      subtitle={`${plural(records.length, 'record')} on this phone`}
      header={
        <>
          <SyncBanner
            waiting={pendingCount - problemCount}
            problems={problemCount}
            photosWaiting={photosWaiting}
            photosHeld={waitingPhotoCount - photosWaiting}
            photoProblems={photoProblemCount}
            signedIn={status === 'signed-in'}
            syncing={running}
            message={message}
            onSync={syncNow}
            onSignIn={() => router.navigate('/profile')}
          />

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
        </>
      }
      data={shown}
      keyExtractor={(record) => record.id}
      renderItem={(record) => <RecordRow record={record} />}
      empty={
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
      }
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: 12,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});

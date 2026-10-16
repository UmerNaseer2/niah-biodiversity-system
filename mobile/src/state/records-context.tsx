import { SplashScreen } from 'expo-router';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { SAMPLE_RECORDS } from '@/data/mock-records';
import { openRecordsStore, type RecordsStore } from '@/db/records-store';
import { useTheme } from '@/hooks/use-theme';
import { matchesTag, newId, tagCodeFor } from '@/lib/id';
import type { NewPlantRecord, PlantRecord } from '@/types/plant-record';

// Records are saved in SQLite on the phone (src/db), so they're still there after the app
// restarts or the phone runs out of battery. Item 10 adds the upload to Supabase.

type RecordsContextValue = {
  /** Newest first. */
  records: PlantRecord[];
  pendingCount: number;
  syncedCount: number;
  /**
   * Saves the record on the phone, then puts it at the top of the list. If saving fails it
   * throws and the list stays as it was.
   */
  addRecord: (draft: NewPlantRecord) => Promise<PlantRecord>;
  getRecord: (id: string) => PlantRecord | undefined;
  findByTag: (input: string) => PlantRecord | undefined;
};

type StoreState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; store: RecordsStore; saved: PlantRecord[] };

const OPEN_FAILED = "Couldn't open the records saved on this phone.";

const RecordsContext = createContext<RecordsContextValue | null>(null);

function newestFirst(a: PlantRecord, b: PlantRecord) {
  return b.recordedAt.localeCompare(a.recordedAt);
}

/** Opens the records saved on the phone and only shows the app once they're loaded. */
export function RecordsProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [state, setState] = useState<StoreState>({ status: 'loading' });
  // Going up by one opens the database again after it failed.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const opening = openRecordsStore();
    opening
      .then(async (store) => ({ store, saved: await store.loadRecords() }))
      .then(
        ({ store, saved }) => {
          if (active) {
            setState({ status: 'ready', store, saved });
          }
        },
        (error: unknown) => {
          if (active) {
            console.warn("Couldn't open the records database.", error);
            setState({ status: 'failed' });
          }
        },
      );
    return () => {
      active = false;
      opening.then((store) => store.close()).catch(() => undefined);
    };
  }, [attempt]);

  useEffect(() => {
    if (state.status === 'failed') {
      // The splash screen only goes away by itself once the screens show, and they don't show
      // without the records, so it would hide the problem message below.
      SplashScreen.hideAsync().catch(() => undefined);
      // On the web the role="alert" below does the same job.
      if (Platform.OS !== 'web') {
        AccessibilityInfo.announceForAccessibility(OPEN_FAILED);
      }
    }
  }, [state.status]);

  if (state.status === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} aria-label="Loading the records on this phone" />
      </View>
    );
  }

  if (state.status === 'failed') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <View style={styles.problem}>
          <ThemedText type="subtitle" role="alert">
            {OPEN_FAILED}
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Try again. If it keeps happening, close the app and open it again.
          </ThemedText>
          <Button
            label="Try again"
            onPress={() => {
              setState({ status: 'loading' });
              setAttempt((current) => current + 1);
            }}
          />
        </View>
      </View>
    );
  }

  const { store } = state;
  // The sample records only show in development builds. They're never saved, so the upload in
  // item 10 (which only reads the database) can't send them anywhere.
  const records = [...state.saved, ...SAMPLE_RECORDS].sort(newestFirst);

  const pendingCount = records.filter((record) => record.syncStatus === 'pending').length;
  // Counted on its own instead of total minus pending, so records that fail to upload in item 10
  // don't show up as synced.
  const syncedCount = records.filter((record) => record.syncStatus === 'synced').length;

  async function addRecord(draft: NewPlantRecord) {
    let id = newId();
    // The tag code is only the start of the ID, so two records could end up with the same one.
    // That's very unlikely, but a fresh ID costs nothing and the table won't take a repeat.
    while (records.some((record) => record.tagCode === tagCodeFor(id))) {
      id = newId();
    }
    const record: PlantRecord = {
      ...draft,
      id,
      tagCode: tagCodeFor(id),
      photoCount: 0,
      recordedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await store.saveRecord(record);
    setState((current) =>
      current.status === 'ready' ? { ...current, saved: [record, ...current.saved] } : current,
    );
    return record;
  }

  function getRecord(id: string) {
    return records.find((record) => record.id === id);
  }

  function findByTag(input: string) {
    return records.find((record) => matchesTag(record, input));
  }

  return (
    <RecordsContext
      value={{ records, pendingCount, syncedCount, addRecord, getRecord, findByTag }}>
      {children}
    </RecordsContext>
  );
}

export function useRecords() {
  const context = use(RecordsContext);
  if (!context) {
    throw new Error('useRecords has to be used inside RecordsProvider.');
  }
  return context;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  problem: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
});

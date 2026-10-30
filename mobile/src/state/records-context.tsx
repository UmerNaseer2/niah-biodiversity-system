import { SplashScreen } from 'expo-router';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { SAMPLE_RECORDS } from '@/data/mock-records';
import { SPECIES_LIST, type SpeciesOption } from '@/data/species-list';
import { DatabaseTooNewError } from '@/db/database';
import { openRecordsStore, type RecordsStore } from '@/db/records-store';
import { useTheme } from '@/hooks/use-theme';
import { matchesTag, newId, tagCodeFor } from '@/lib/id';
import type { UploadOutcome } from '@/sync/upload-row';
import type { NewPlantRecord, PlantRecord } from '@/types/plant-record';

// Records are saved in SQLite on the phone (src/db), so they're still there after the app
// restarts or the phone runs out of battery. The species list downloaded when the phone syncs is
// saved there too. Item 10 adds the "Sync now" button that uploads and downloads them, using the
// functions here.

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
  /** The records to upload, oldest first. Never the sample records, because those aren't saved. */
  loadWaiting: () => Promise<PlantRecord[]>;
  /** Saves what happened to an upload on the phone, then updates the record in the list. */
  saveUploadOutcome: (id: string, outcome: UploadOutcome) => Promise<void>;
  /**
   * Takes a record an officer deleted on the website off the phone, then off the list. Throws
   * for any other record and the list stays as it was.
   */
  removeDeleted: (id: string) => Promise<void>;
  /**
   * The species the New Record form suggests: the last list downloaded, or the one that comes
   * with the app if there hasn't been a download yet.
   */
  species: SpeciesOption[];
  /** Saves a downloaded species list on the phone. If that fails it throws and nothing changes. */
  replaceSpecies: (list: SpeciesOption[]) => Promise<void>;
};

type StoreState =
  | { status: 'loading' }
  /** tooNew means a newer copy of the app saved the records, so trying again won't help. */
  | { status: 'failed'; tooNew: boolean }
  | { status: 'ready'; store: RecordsStore; saved: PlantRecord[]; species: SpeciesOption[] };

const OPEN_FAILED = "Couldn't open the records saved on this phone.";
const APP_TOO_OLD = 'Update the app to open the records saved on this phone.';

const RecordsContext = createContext<RecordsContextValue | null>(null);

function newestFirst(a: PlantRecord, b: PlantRecord) {
  return b.recordedAt.localeCompare(a.recordedAt);
}

/** The record the way the store leaves it after saveUploadOutcome. */
function withOutcome(record: PlantRecord, outcome: UploadOutcome): PlantRecord {
  switch (outcome.kind) {
    case 'synced':
      return { ...record, syncStatus: 'synced', uploadProblem: undefined };
    case 'problem':
      return { ...record, uploadProblem: outcome.problem };
    case 'retry':
      return record;
  }
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
      .then(async (store) => ({
        store,
        saved: await store.loadRecords(),
        species: await store.loadSpecies(),
      }))
      .then(
        ({ store, saved, species }) => {
          if (active) {
            setState({ status: 'ready', store, saved, species });
          }
        },
        (error: unknown) => {
          if (active) {
            console.warn("Couldn't open the records database.", error);
            setState({ status: 'failed', tooNew: error instanceof DatabaseTooNewError });
          }
        },
      );
    return () => {
      active = false;
      opening.then((store) => store.close()).catch(() => undefined);
    };
  }, [attempt]);

  const failedMessage = state.status === 'failed' && state.tooNew ? APP_TOO_OLD : OPEN_FAILED;

  useEffect(() => {
    if (state.status === 'failed') {
      // The splash screen only goes away by itself once the screens show, and they don't show
      // without the records, so it would hide the problem message below.
      SplashScreen.hideAsync().catch(() => undefined);
      // On the web the role="alert" below does the same job.
      if (Platform.OS !== 'web') {
        AccessibilityInfo.announceForAccessibility(failedMessage);
      }
    }
  }, [state.status, failedMessage]);

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
            {failedMessage}
          </ThemedText>
          {state.tooNew ? (
            // Trying again would only fail the same way, so there's no button for it.
            <ThemedText themeColor="textSecondary">
              A newer copy of the app saved them, and this one can&apos;t read them. They are
              still on this phone and nothing has been changed.
            </ThemedText>
          ) : (
            <>
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
            </>
          )}
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
  const species = state.species.length > 0 ? state.species : SPECIES_LIST;

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

  function loadWaiting() {
    return store.loadWaiting();
  }

  async function saveUploadOutcome(id: string, outcome: UploadOutcome) {
    await store.saveUploadOutcome(id, outcome);
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            saved: current.saved.map((record) =>
              record.id === id ? withOutcome(record, outcome) : record,
            ),
          }
        : current,
    );
  }

  async function removeDeleted(id: string) {
    await store.removeDeleted(id);
    setState((current) =>
      current.status === 'ready'
        ? { ...current, saved: current.saved.filter((record) => record.id !== id) }
        : current,
    );
  }

  async function replaceSpecies(list: SpeciesOption[]) {
    await store.replaceSpecies(list);
    setState((current) => (current.status === 'ready' ? { ...current, species: list } : current));
  }

  return (
    <RecordsContext
      value={{
        records,
        pendingCount,
        syncedCount,
        addRecord,
        getRecord,
        findByTag,
        loadWaiting,
        saveUploadOutcome,
        removeDeleted,
        species,
        replaceSpecies,
      }}>
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

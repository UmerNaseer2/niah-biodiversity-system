import { SplashScreen } from 'expo-router';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { SAMPLE_RECORDS } from '@/data/mock-records';
import { SPECIES_LIST, type SpeciesOption } from '@/data/species-list';
import { DatabaseTooNewError } from '@/db/database';
import { DatabaseLockedError } from '@/db/encryption';
import { openRecordsStore, type RecordReview, type RecordsStore } from '@/db/records-store';
import { useTheme } from '@/hooks/use-theme';
import { matchesTag, newId, tagCodeFor } from '@/lib/id';
import { deletePhotoFile, removeStrayPhotos } from '@/lib/photo-files';
import type { UploadOutcome } from '@/sync/upload-row';
import type { NewPlantRecord, PhotoOutcome, PlantRecord, RecordPhoto } from '@/types/plant-record';

// Records are saved in SQLite on the phone (src/db), so they're still there after the app
// restarts or the phone runs out of battery. The species list downloaded when the phone syncs is
// saved there too. src/state/sync-context.tsx uploads and downloads them, using the functions here.

type RecordsContextValue = {
  /** Newest first. */
  records: PlantRecord[];
  pendingCount: number;
  syncedCount: number;
  /** Saved records that can go up as soon as there's signal, so no sample or problem records. */
  waitingCount: number;
  /**
   * Saved records that aren't on the server yet, the ones with a problem too. Pressing Sync now
   * tries those again, so this is what would go up under whoever signs in next.
   */
  notUploadedCount: number;
  /** Photos of records already on the server that can still go up, whichever account sent them. */
  waitingPhotoCount: number;
  /** Photos that won't go up until someone looks at them. */
  photoProblemCount: number;
  /**
   * Saves the record and its photos on the phone, then puts it at the top of the list. If saving
   * fails it throws and the list stays as it was. photoPaths come from src/lib/photo-files.ts.
   */
  addRecord: (draft: NewPlantRecord, photoPaths?: string[]) => Promise<PlantRecord>;
  getRecord: (id: string) => PlantRecord | undefined;
  findByTag: (input: string) => PlantRecord | undefined;
  /** The records to upload, oldest first. Never the sample records, because those aren't saved. */
  loadWaiting: () => Promise<PlantRecord[]>;
  /**
   * Saves what happened to an upload on the phone, then updates the record in the list. uploadedBy
   * is the account that sent it, which its photos have to wait for.
   */
  saveUploadOutcome: (id: string, outcome: UploadOutcome, uploadedBy?: string) => Promise<void>;
  /** A record's photos, first one first. Sample records don't have any. */
  photosFor: (recordId: string) => RecordPhoto[];
  /** How many photos this account can send right now. Nobody signed in means 0. */
  photosWaitingFor: (accountId: string | undefined) => number;
  /** The photos to upload for this account, in the order their records were made. */
  loadPhotosToUpload: (accountId: string) => Promise<RecordPhoto[]>;
  /** Saves what happened to a photo on the phone, then updates it in the list. */
  savePhotoOutcome: (recordId: string, position: number, outcome: PhotoOutcome) => Promise<void>;
  /**
   * Takes a record an officer deleted on the website and its photos off the phone, then off the
   * list. Throws for any other record and the list stays as it was.
   */
  removeDeleted: (id: string) => Promise<void>;
  /** The IDs of the records on the server, so the phone can ask what became of them. */
  loadSyncedIds: () => Promise<string[]>;
  /** Saves what officers decided, then updates the records in the list. */
  saveReviews: (reviews: RecordReview[]) => Promise<void>;
  /**
   * Gives a record whose tag code was taken on the server a new ID and tag code, then updates the
   * list and gives back the new ID. Its photos stay with it. Throws for any other record and the
   * list stays as it was.
   */
  renewTag: (id: string) => Promise<string>;
  loadLastSynced: () => Promise<string | null>;
  saveLastSynced: (finishedAt: string) => Promise<void>;
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
  /** Why they wouldn't open. Trying again can only help with 'other'. */
  | { status: 'failed'; reason: 'too-new' | 'locked' | 'other' }
  | {
      status: 'ready';
      store: RecordsStore;
      saved: PlantRecord[];
      photos: RecordPhoto[];
      species: SpeciesOption[];
    };

const OPEN_FAILED = "Couldn't open the records saved on this phone.";
const APP_TOO_OLD = 'Update the app to open the records saved on this phone.';
const RECORDS_LOCKED = "The records saved on this phone can't be unlocked.";

function failureReason(error: unknown) {
  if (error instanceof DatabaseTooNewError) {
    return 'too-new';
  }
  return error instanceof DatabaseLockedError ? 'locked' : 'other';
}

const RecordsContext = createContext<RecordsContextValue | null>(null);

function newestFirst(a: PlantRecord, b: PlantRecord) {
  return b.recordedAt.localeCompare(a.recordedAt);
}

/** The record the way the store leaves it after saveUploadOutcome. */
function withOutcome(
  record: PlantRecord,
  outcome: UploadOutcome,
  uploadedBy: string | undefined,
): PlantRecord {
  switch (outcome.kind) {
    case 'synced':
      return { ...record, syncStatus: 'synced', uploadProblem: undefined, uploadedBy };
    case 'problem':
      return { ...record, uploadProblem: outcome.problem };
    case 'retry':
      return record;
  }
}

/** The photo the way the store leaves it after savePhotoOutcome. */
function withPhotoOutcome(photo: RecordPhoto, outcome: PhotoOutcome): RecordPhoto {
  return outcome.kind === 'uploaded'
    ? { ...photo, uploadedAt: outcome.uploadedAt, problem: undefined }
    : { ...photo, problem: outcome.problem };
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
        photos: await store.loadPhotos(),
        species: await store.loadSpecies(),
      }))
      .then(
        ({ store, saved, photos, species }) => {
          // Before the form can show, so this can't take a photo that's on the form.
          removeStrayPhotos(photos.map((photo) => photo.path));
          if (active) {
            setState({ status: 'ready', store, saved, photos, species });
          }
        },
        (error: unknown) => {
          if (active) {
            console.warn("Couldn't open the records database.", error);
            setState({ status: 'failed', reason: failureReason(error) });
          }
        },
      );
    return () => {
      active = false;
      opening.then((store) => store.close()).catch(() => undefined);
    };
  }, [attempt]);

  const failedMessage =
    state.status === 'failed'
      ? { 'too-new': APP_TOO_OLD, locked: RECORDS_LOCKED, other: OPEN_FAILED }[state.reason]
      : OPEN_FAILED;

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
          {/* For the first two, trying again would only fail the same way, so there's no button. */}
          {state.reason === 'too-new' ? (
            <ThemedText themeColor="textSecondary">
              A newer copy of the app saved them, and this one can&apos;t read them. They are still
              on this phone and nothing has been changed.
            </ThemedText>
          ) : state.reason === 'locked' ? (
            <ThemedText themeColor="textSecondary">
              The key that opens them isn&apos;t on this phone any more, which can happen after
              moving to a new phone from a backup. Anything you already uploaded is safe on the
              server. Nothing here has been changed. Reinstalling the app starts fresh, but it
              removes what hadn&apos;t uploaded.
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

  const { store, photos: savedPhotos } = state;
  // The sample records only show in development builds. They're never saved, so the upload (which
  // only reads the database) can't send them anywhere.
  const records = [...state.saved, ...SAMPLE_RECORDS].sort(newestFirst);

  const pendingCount = records.filter((record) => record.syncStatus === 'pending').length;
  // Counted on its own instead of total minus pending, so records that fail to upload don't show
  // up as synced.
  const syncedCount = records.filter((record) => record.syncStatus === 'synced').length;
  const waitingCount = state.saved.filter(
    (record) => record.syncStatus === 'pending' && !record.uploadProblem,
  ).length;
  const notUploadedCount = state.saved.filter((record) => record.syncStatus === 'pending').length;
  const species = state.species.length > 0 ? state.species : SPECIES_LIST;
  // The photos of a record that's still waiting go up with it, so they're counted with it.
  const uploaderOf = new Map(
    state.saved
      .filter((record) => record.syncStatus === 'synced')
      .map((record) => [record.id, record.uploadedBy]),
  );
  const canStillGoUp = state.photos.filter(
    (photo) => uploaderOf.has(photo.recordId) && !photo.uploadedAt && !photo.problem,
  );
  const waitingPhotoCount = canStillGoUp.length;
  const photoProblemCount = state.photos.filter((photo) => photo.problem).length;

  /** The tag code is only the start of the ID, so two records could end up with the same one. */
  function unusedId() {
    let id = newId();
    // That's very unlikely, but a fresh ID costs nothing and the table won't take a repeat.
    while (records.some((record) => record.tagCode === tagCodeFor(id))) {
      id = newId();
    }
    return id;
  }

  async function addRecord(draft: NewPlantRecord, photoPaths: string[] = []) {
    const id = unusedId();
    const record: PlantRecord = {
      ...draft,
      id,
      tagCode: tagCodeFor(id),
      photoCount: photoPaths.length,
      recordedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await store.saveRecord(record, photoPaths);
    const photos = photoPaths.map((path, index) => ({
      recordId: id,
      position: index + 1,
      path,
    }));
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            saved: [record, ...current.saved],
            photos: [...current.photos, ...photos],
          }
        : current,
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

  async function saveUploadOutcome(id: string, outcome: UploadOutcome, uploadedBy?: string) {
    await store.saveUploadOutcome(id, outcome, uploadedBy);
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            saved: current.saved.map((record) =>
              record.id === id ? withOutcome(record, outcome, uploadedBy) : record,
            ),
          }
        : current,
    );
  }

  function photosFor(recordId: string) {
    return savedPhotos.filter((photo) => photo.recordId === recordId);
  }

  function photosWaitingFor(accountId: string | undefined) {
    return accountId
      ? canStillGoUp.filter((photo) => uploaderOf.get(photo.recordId) === accountId).length
      : 0;
  }

  function loadPhotosToUpload(accountId: string) {
    return store.loadPhotosToUpload(accountId);
  }

  async function savePhotoOutcome(recordId: string, position: number, outcome: PhotoOutcome) {
    await store.savePhotoOutcome(recordId, position, outcome);
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            photos: current.photos.map((photo) =>
              photo.recordId === recordId && photo.position === position
                ? withPhotoOutcome(photo, outcome)
                : photo,
            ),
          }
        : current,
    );
  }

  async function removeDeleted(id: string) {
    const paths = photosFor(id).map((photo) => photo.path);
    await store.removeDeleted(id);
    paths.forEach(deletePhotoFile);
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            saved: current.saved.filter((record) => record.id !== id),
            photos: current.photos.filter((photo) => photo.recordId !== id),
          }
        : current,
    );
  }

  function loadSyncedIds() {
    return store.loadSyncedIds();
  }

  async function saveReviews(reviews: RecordReview[]) {
    await store.saveReviews(reviews);
    const byId = new Map(reviews.map((review) => [review.id, review]));
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            saved: current.saved.map((record) => {
              const review = byId.get(record.id);
              return review
                ? {
                    ...record,
                    reviewStatus: review.status,
                    reviewNotes: review.notes ?? undefined,
                  }
                : record;
            }),
          }
        : current,
    );
  }

  async function renewTag(id: string) {
    const newRecordId = unusedId();
    const tagCode = tagCodeFor(newRecordId);
    await store.renewTag(id, newRecordId, tagCode);
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            saved: current.saved.map((record) =>
              record.id === id
                ? { ...record, id: newRecordId, tagCode, uploadProblem: undefined }
                : record,
            ),
            photos: current.photos.map((photo) =>
              photo.recordId === id ? { ...photo, recordId: newRecordId } : photo,
            ),
          }
        : current,
    );
    return newRecordId;
  }

  function loadLastSynced() {
    return store.loadLastSynced();
  }

  function saveLastSynced(finishedAt: string) {
    return store.saveLastSynced(finishedAt);
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
        waitingCount,
        notUploadedCount,
        waitingPhotoCount,
        photoProblemCount,
        addRecord,
        getRecord,
        findByTag,
        loadWaiting,
        saveUploadOutcome,
        photosFor,
        photosWaitingFor,
        loadPhotosToUpload,
        savePhotoOutcome,
        removeDeleted,
        loadSyncedIds,
        saveReviews,
        renewTag,
        loadLastSynced,
        saveLastSynced,
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

import type { SpeciesOption } from '@/data/species-list';
import type { PlantRecord, RecordPhoto } from '@/types/plant-record';

import type { RecordsStore } from './records-store';

// The web build is only for looking at the screens on a computer, so it keeps records in memory
// and they're gone when the page reloads. SQLite on the web is still in alpha with expo-sqlite,
// and it needs a WebAssembly file, extra server headers and changes to the Metro config.
// It follows the same rules as the tables in database.ts. On the web './records-store' is this
// file, so the messages are written out here instead of imported.
export async function openRecordsStore(): Promise<RecordsStore> {
  const saved: PlantRecord[] = [];
  const photos: RecordPhoto[] = [];
  let species: SpeciesOption[] = [];
  let lastSynced: string | null = null;

  return {
    async loadRecords() {
      return [...saved];
    },
    async saveRecord(record, photoPaths = []) {
      if (saved.some((other) => other.id === record.id || other.tagCode === record.tagCode)) {
        throw new Error(`A record with the ID or tag code of ${record.tagCode} is already saved.`);
      }
      saved.unshift(record);
      for (const [index, path] of photoPaths.entries()) {
        photos.push({ recordId: record.id, position: index + 1, path });
      }
    },
    async loadWaiting() {
      // Newest first turned around. Records are saved as they're made, so that's oldest first.
      return saved.filter((record) => record.syncStatus === 'pending').reverse();
    },
    async saveUploadOutcome(id, outcome, uploadedBy) {
      if (outcome.kind === 'retry') {
        return;
      }
      const index = saved.findIndex((record) => record.id === id);
      if (index === -1) {
        return;
      }
      const record = saved[index];
      if (outcome.kind === 'synced') {
        saved[index] = { ...record, syncStatus: 'synced', uploadProblem: undefined, uploadedBy };
      } else if (record.syncStatus === 'pending') {
        saved[index] = { ...record, uploadProblem: outcome.problem };
      } else {
        throw new Error("A record that's on the server can't have an upload problem.");
      }
    },
    async removeDeleted(id) {
      const index = saved.findIndex(
        (record) => record.id === id && record.uploadProblem === 'deleted',
      );
      if (index === -1) {
        throw new Error('Only a record an officer deleted on the website can be removed.');
      }
      saved.splice(index, 1);
      for (let photo = photos.length - 1; photo >= 0; photo--) {
        if (photos[photo].recordId === id) {
          photos.splice(photo, 1);
        }
      }
    },
    async loadSyncedIds() {
      return saved.filter((record) => record.syncStatus === 'synced').map((record) => record.id);
    },
    async saveReviews(reviews) {
      for (const review of reviews) {
        const index = saved.findIndex((record) => record.id === review.id);
        if (index !== -1) {
          saved[index] = {
            ...saved[index],
            reviewStatus: review.status,
            reviewNotes: review.notes ?? undefined,
          };
        }
      }
    },
    async renewTag(id, newId, newTagCode) {
      const index = saved.findIndex(
        (record) => record.id === id && record.uploadProblem === 'tag-clash',
      );
      if (index === -1) {
        throw new Error('Only a record whose tag code was taken can get a new one.');
      }
      saved[index] = { ...saved[index], id: newId, tagCode: newTagCode, uploadProblem: undefined };
      for (const photo of photos) {
        if (photo.recordId === id) {
          photo.recordId = newId;
        }
      }
    },
    async loadPhotos() {
      return photos.map((photo) => ({ ...photo }));
    },
    async loadPhotosToUpload(accountId) {
      // saved is newest first and photos are in order within a record, so turn the records around.
      return [...saved]
        .reverse()
        .filter((record) => record.syncStatus === 'synced' && record.uploadedBy === accountId)
        .flatMap((record) =>
          photos
            .filter((photo) => photo.recordId === record.id && !photo.uploadedAt)
            .map((photo) => ({ ...photo })),
        );
    },
    async savePhotoOutcome(recordId, position, outcome) {
      const photo = photos.find((one) => one.recordId === recordId && one.position === position);
      if (!photo) {
        return;
      }
      if (outcome.kind === 'uploaded') {
        photo.uploadedAt = outcome.uploadedAt;
        photo.problem = undefined;
      } else {
        photo.problem = outcome.problem;
      }
    },
    async loadLastSynced() {
      return lastSynced;
    },
    async saveLastSynced(finishedAt) {
      lastSynced = finishedAt;
    },
    async loadSpecies() {
      return [...species];
    },
    async replaceSpecies(list) {
      if (list.length === 0) {
        throw new Error('The species list that came down was empty, so the old one stays.');
      }
      const slugs = new Set(list.map((option) => option.slug));
      if (slugs.size < list.length || list.some((o) => o.slug === '' || o.scientificName === '')) {
        throw new Error('A species in the list has no name or a repeated slug.');
      }
      species = [...list];
    },
    async close() {},
  };
}

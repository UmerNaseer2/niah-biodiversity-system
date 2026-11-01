import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import * as Network from 'expo-network';

import { readPhotoBytes } from '@/lib/photo-files';

import {
  fetchAllPages,
  toReviews,
  toSpeciesOptions,
  type ReviewRow,
  type SpeciesRow,
  type SyncApi,
} from './sync-engine';
import { classifyPhotoUpload } from './upload-row';

// The private bucket from supabase/005_phone_sync.sql.
const RECORD_PHOTO_BUCKET = 'record-photos';

/** The real server for src/sync/sync-engine.ts. */
export function supabaseSyncApi(supabase: SupabaseClient): SyncApi {
  return {
    async session() {
      // With an expired token and no signal, getSession keeps retrying the refresh for up to half
      // a minute. If the phone already knows it's offline there's no reason to wait for that.
      const network = await Network.getNetworkStateAsync();
      if (network.isConnected === false) {
        return 'offline';
      }
      const { data, error } = await supabase.auth.getSession();
      if (data.session) {
        return 'ok';
      }
      return error && isAuthRetryableFetchError(error) ? 'offline' : 'signed-out';
    },

    async accountId() {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },

    async insertRecord(row) {
      // No .select(), because a record that's waiting for review can't always be read back.
      const { error, status } = await supabase.from('records').insert(row);
      return { error, status };
    },

    async uploadPhoto(storagePath, localPath) {
      let bytes: ArrayBuffer | null;
      try {
        bytes = await readPhotoBytes(localPath);
      } catch (error) {
        // The file is there but couldn't be read, and that shouldn't hold up every other photo.
        console.warn("Couldn't read a photo.", error);
        return 'retry';
      }
      if (!bytes) {
        return 'missing';
      }
      // The bytes on their own, because a Blob or FormData goes as multipart, which Storage would
      // save with the wrong content. No upsert, because nobody can replace a photo.
      const { error } = await supabase.storage
        .from(RECORD_PHOTO_BUCKET)
        .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
      return classifyPhotoUpload(error);
    },

    async fetchReviews(ids) {
      const { data, error } = await supabase
        .from('records')
        .select('id, status, review_notes')
        .in('id', ids);
      return error ? null : toReviews(data as ReviewRow[]);
    },

    async fetchSpecies() {
      const rows = await fetchAllPages<SpeciesRow>(async (from, to) => {
        const { data, error } = await supabase
          .from('species_public')
          .select('id, scientific_name, common_names')
          .order('id')
          .range(from, to);
        return error ? null : (data as SpeciesRow[]);
      });
      return rows && toSpeciesOptions(rows);
    },
  };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Network from 'expo-network';

import type {
  PublicCopyApi,
  RecordsPublicRow,
  SpeciesPhotosRow,
  SpeciesPublicRow,
} from './public-copy';
import { fetchAllPages } from './sync-engine';

// Only the columns the plant page on the phone shows. records_public also has a location column,
// and the phone never asks for it, because the plant page doesn't say where a plant is.
const SPECIES_COLUMNS =
  'id, scientific_name, authority, family, common_names, iucn_code, sarawak_protected, newer_name, summary, about, description, habitat, uses';
const RECORD_COLUMNS =
  'id, tag_code, species_slug, species_name, common_name, height_m, condition, recorded_at';

// The website's public storage for species photos. The photos taken of each record are kept
// somewhere else that needs a sign in, and the phone never asks for those.
const PHOTO_BUCKET = 'botanical-photos';

/** A page that couldn't be read. Null makes that list fail, so the copy saved before stays. */
function failed(error: unknown, status: number, message = "Couldn't download the plant info.") {
  // No answer at all is just no signal. An answer with an error won't fix itself, like when the
  // server is missing a column because one of the SQL files hasn't been run, so it gets a warning.
  if (status !== 0) {
    console.warn(message, error);
  }
  return null;
}

/** The real server for src/sync/public-copy.ts. Nobody has to be signed in. */
export function supabasePublicCopyApi(supabase: SupabaseClient): PublicCopyApi {
  return {
    async online() {
      // Only a phone that knows it has no signal counts as offline. If it isn't sure, it tries.
      const network = await Network.getNetworkStateAsync();
      return network.isConnected !== false;
    },

    fetchSpecies() {
      return fetchAllPages<SpeciesPublicRow>(async (from, to) => {
        const { data, error, status } = await supabase
          .from('species_public')
          .select(SPECIES_COLUMNS)
          .order('id')
          .range(from, to);
        return error ? failed(error, status) : (data as SpeciesPublicRow[]);
      });
    },

    fetchRecords() {
      return fetchAllPages<RecordsPublicRow>(async (from, to) => {
        // The view only has published records, but the website asks for them again as well, so
        // a change to the view can't put a record on a visitor's phone by mistake.
        const { data, error, status } = await supabase
          .from('records_public')
          .select(RECORD_COLUMNS)
          .eq('status', 'published')
          .order('id')
          .range(from, to);
        return error ? failed(error, status) : (data as RecordsPublicRow[]);
      });
    },

    fetchPhotos() {
      return fetchAllPages<SpeciesPhotosRow>(async (from, to) => {
        // The same view of each species' photo list that the website reads.
        const { data, error, status } = await supabase
          .from('species_photos_public')
          .select('id, photos')
          .order('id')
          .range(from, to);
        return error
          ? failed(error, status, "Couldn't download the species photos.")
          : (data as SpeciesPhotosRow[]);
      });
    },

    photoUrl(path) {
      return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    },
  };
}

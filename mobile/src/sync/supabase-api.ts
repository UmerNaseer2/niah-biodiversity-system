import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import * as Network from 'expo-network';

import {
  fetchAllPages,
  toReviews,
  toSpeciesOptions,
  type ReviewRow,
  type SpeciesRow,
  type SyncApi,
} from './sync-engine';

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

    async insertRecord(row) {
      // No .select(), because a record that's waiting for review can't always be read back.
      const { error, status } = await supabase.from('records').insert(row);
      return { error, status };
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

import type { PlantRecord } from '@/types/plant-record';

import { openDatabase } from './database';

/** The records saved on this phone. */
export type RecordsStore = {
  /** Every saved record, newest first. */
  loadRecords: () => Promise<PlantRecord[]>;
  /** Saves a new record. Fails if a saved record already has the same ID or tag code. */
  saveRecord: (record: PlantRecord) => Promise<void>;
  close: () => Promise<void>;
};

/** One row of plant_records the way SQLite hands it back, with null for an empty column. */
type RecordRow = {
  id: string;
  tag_code: string;
  species_name: string;
  species_slug: string | null;
  common_name: string | null;
  height_m: number | null;
  condition: PlantRecord['condition'];
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  captured_at: string | null;
  photo_count: number;
  recorded_at: string;
  sync_status: PlantRecord['syncStatus'];
};

function toRecord(row: RecordRow): PlantRecord {
  const { latitude, longitude, accuracy_m: accuracyM, captured_at: capturedAt } = row;
  return {
    id: row.id,
    tagCode: row.tag_code,
    speciesName: row.species_name,
    speciesSlug: row.species_slug ?? undefined,
    commonName: row.common_name ?? undefined,
    heightM: row.height_m ?? undefined,
    condition: row.condition,
    notes: row.notes ?? undefined,
    // The table only takes all four parts of a location or none of them.
    location:
      latitude !== null && longitude !== null && accuracyM !== null && capturedAt !== null
        ? { latitude, longitude, accuracyM, capturedAt }
        : undefined,
    photoCount: row.photo_count,
    recordedAt: row.recorded_at,
    syncStatus: row.sync_status,
  };
}

export async function openRecordsStore(): Promise<RecordsStore> {
  const db = await openDatabase();

  return {
    async loadRecords() {
      // rowid keeps two records saved in the same millisecond in the order they were saved.
      const rows = await db.getAllAsync<RecordRow>(
        'SELECT * FROM plant_records ORDER BY recorded_at DESC, rowid DESC',
      );
      return rows.map(toRecord);
    },

    async saveRecord(record) {
      await db.runAsync(
        `INSERT INTO plant_records (
          id, tag_code, species_name, species_slug, common_name, height_m, condition, notes,
          latitude, longitude, accuracy_m, captured_at, photo_count, recorded_at, sync_status
        ) VALUES (
          $id, $tagCode, $speciesName, $speciesSlug, $commonName, $heightM, $condition, $notes,
          $latitude, $longitude, $accuracyM, $capturedAt, $photoCount, $recordedAt, $syncStatus
        )`,
        {
          $id: record.id,
          $tagCode: record.tagCode,
          $speciesName: record.speciesName,
          $speciesSlug: record.speciesSlug ?? null,
          $commonName: record.commonName ?? null,
          $heightM: record.heightM ?? null,
          $condition: record.condition,
          $notes: record.notes ?? null,
          $latitude: record.location?.latitude ?? null,
          $longitude: record.location?.longitude ?? null,
          $accuracyM: record.location?.accuracyM ?? null,
          $capturedAt: record.location?.capturedAt ?? null,
          $photoCount: record.photoCount,
          $recordedAt: record.recordedAt,
          $syncStatus: record.syncStatus,
        },
      );
    },

    close() {
      return db.closeAsync();
    },
  };
}

// A later visit to a plant is a new record whose visitOf is the plant's first record, so the first
// record keeps what was seen the first time. Visits are one level deep: visitOf always points at
// the first record, never at another visit (supabase/028_record_visits.sql checks the same).
import type { PlantRecord } from '@/types/plant-record';

/** The ID of the plant's first record: the record itself, or the one it's a visit to. */
export function firstRecordId(record: Pick<PlantRecord, 'id' | 'visitOf'>) {
  return record.visitOf ?? record.id;
}

/**
 * Everything this phone has on the plant a record is about: its first record and every visit to
 * it, newest first. The first record is left out when it isn't on this phone. Two saved at the
 * same moment keep the order they came in.
 */
export function plantHistory(records: readonly PlantRecord[], record: PlantRecord) {
  const firstId = firstRecordId(record);
  return records
    .filter((one) => one.id === firstId || one.visitOf === firstId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

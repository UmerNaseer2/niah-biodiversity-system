import type { PlantRecord } from '@/types/plant-record';

import type { RecordsStore } from './records-store';

// The web build is only for looking at the screens on a computer, so it keeps records in memory
// and they're gone when the page reloads. SQLite on the web is still in alpha with expo-sqlite,
// and it needs a WebAssembly file, extra server headers and changes to the Metro config.
export async function openRecordsStore(): Promise<RecordsStore> {
  const saved: PlantRecord[] = [];

  return {
    async loadRecords() {
      return [...saved];
    },
    async saveRecord(record) {
      if (saved.some((other) => other.id === record.id || other.tagCode === record.tagCode)) {
        throw new Error(`A record with the ID or tag code of ${record.tagCode} is already saved.`);
      }
      saved.unshift(record);
    },
    async close() {},
  };
}

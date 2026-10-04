import { createContext, use, useState, type ReactNode } from 'react';

import { MOCK_RECORDS } from '@/data/mock-records';
import { matchesTag, newId, tagCodeFor } from '@/lib/id';
import type { NewPlantRecord, PlantRecord } from '@/types/plant-record';

// Records only live in memory for now, so they reset every time the app restarts.
// Item 9 moves them into expo-sqlite and item 10 adds the upload to Supabase.

type RecordsContextValue = {
  /** Newest first. */
  records: PlantRecord[];
  pendingCount: number;
  addRecord: (draft: NewPlantRecord) => PlantRecord;
  getRecord: (id: string) => PlantRecord | undefined;
  findByTag: (input: string) => PlantRecord | undefined;
};

const RecordsContext = createContext<RecordsContextValue | null>(null);

export function RecordsProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState(() =>
    [...MOCK_RECORDS].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
  );

  const pendingCount = records.filter((record) => record.syncStatus === 'pending').length;

  function addRecord(draft: NewPlantRecord) {
    const id = newId();
    const record: PlantRecord = {
      ...draft,
      id,
      tagCode: tagCodeFor(id),
      photoCount: 0,
      recordedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    setRecords((current) => [record, ...current]);
    return record;
  }

  function getRecord(id: string) {
    return records.find((record) => record.id === id);
  }

  function findByTag(input: string) {
    return records.find((record) => matchesTag(record, input));
  }

  return (
    <RecordsContext value={{ records, pendingCount, addRecord, getRecord, findByTag }}>
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

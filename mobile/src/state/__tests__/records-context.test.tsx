import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { MOCK_RECORDS } from '@/data/mock-records';
import { tagCodeFor } from '@/lib/id';
import { RecordsProvider, useRecords } from '@/state/records-context';
import type { NewPlantRecord, PlantRecord } from '@/types/plant-record';

function wrapper({ children }: { children: ReactNode }) {
  return <RecordsProvider>{children}</RecordsProvider>;
}

const draft: NewPlantRecord = {
  speciesName: 'Shorea macrophylla',
  speciesSlug: 'shorea-macrophylla',
  commonName: 'Engkabang',
  heightM: 12.5,
  condition: 'healthy',
};

function renderRecords() {
  return renderHook(() => useRecords(), { wrapper });
}

describe('RecordsProvider', () => {
  it('starts with the mock records, newest first', () => {
    const { result } = renderRecords();
    const times = result.current.records.map((record) => record.recordedAt);
    expect(result.current.records).toHaveLength(MOCK_RECORDS.length);
    expect(times).toEqual([...times].sort().reverse());
  });

  it('adds a new record to the top of the list as waiting to sync', () => {
    const { result } = renderRecords();
    const { pendingCount, syncedCount } = result.current;

    let saved: PlantRecord | undefined;
    act(() => {
      saved = result.current.addRecord(draft);
    });

    expect(saved).toEqual({
      ...draft,
      id: expect.any(String),
      tagCode: tagCodeFor(saved!.id),
      photoCount: 0,
      recordedAt: expect.any(String),
      syncStatus: 'pending',
    });
    expect(Number.isNaN(Date.parse(saved!.recordedAt))).toBe(false);
    expect(result.current.records[0]).toEqual(saved);
    expect(result.current.records).toHaveLength(MOCK_RECORDS.length + 1);
    expect(result.current.pendingCount).toBe(pendingCount + 1);
    expect(result.current.syncedCount).toBe(syncedCount);
  });

  it('gives every new record its own ID and tag', () => {
    const { result } = renderRecords();
    const saved: PlantRecord[] = [];
    act(() => {
      for (let i = 0; i < 20; i += 1) {
        saved.push(result.current.addRecord(draft));
      }
    });
    expect(new Set(saved.map((record) => record.id)).size).toBe(20);
    expect(new Set(saved.map((record) => record.tagCode)).size).toBe(20);
  });

  it('finds a saved record by its ID or the tag printed on it', () => {
    const { result } = renderRecords();
    let saved: PlantRecord | undefined;
    act(() => {
      saved = result.current.addRecord(draft);
    });

    expect(result.current.getRecord(saved!.id)).toEqual(saved);
    expect(result.current.findByTag(saved!.tagCode.toLowerCase())).toEqual(saved);
    expect(result.current.getRecord('not-a-real-id')).toBeUndefined();
    expect(result.current.findByTag('NNP-')).toBeUndefined();
  });
});

describe('useRecords', () => {
  it('says what went wrong when used outside the provider', () => {
    // React logs the error as well, which would only clutter the test output.
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useRecords())).toThrow(
      'useRecords has to be used inside RecordsProvider.',
    );
    logError.mockRestore();
  });
});

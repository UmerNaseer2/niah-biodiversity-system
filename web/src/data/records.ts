// Same six trees as mobile/src/data/mock-records.ts, so both apps tell the
// same story in the demo. All coordinates are made-up points around park HQ
// at Pangkalan Lubang. Real locations of protected species must never go
// into test data.

import type { Condition } from "@/lib/condition";
import { tagCode } from "@/lib/tags";

export type PlantRecord = {
  id: string;
  speciesSlug: string;
  heightM: number;
  condition: Condition;
  photoCount: number;
  gps: { lat: number; lng: number; accuracyM: number } | null;
  notes?: string;
  recordedBy: string;
  recordedAt: string;
  /** Records stay hidden from the public until an officer approves them */
  status: "published" | "waiting";
};

export const records: PlantRecord[] = [
  {
    id: "3f2a9c4e-8b1d-4c6a-9e2f-7a1b5c3d9e01",
    speciesSlug: "eusideroxylon-zwageri",
    heightM: 18.5,
    condition: "healthy",
    photoCount: 2,
    gps: { lat: 3.81488, lng: 113.77968, accuracyM: 6 },
    recordedBy: "daniel",
    recordedAt: "2026-10-02T10:24",
    status: "published",
  },
  {
    id: "8c41e7b2-5d3f-4a9e-b6c1-2e8f4a7d1c02",
    speciesSlug: "nepenthes-ampullaria",
    heightM: 0.4,
    condition: "healthy",
    photoCount: 3,
    gps: { lat: 3.81655, lng: 113.77514, accuracyM: 12 },
    recordedBy: "mira",
    recordedAt: "2026-10-01T14:05",
    status: "published",
  },
  {
    id: "b17d03f9-2c6e-4f8a-a3d5-9e1c7b4f2a03",
    speciesSlug: "koompassia-excelsa",
    heightM: 52,
    condition: "healthy",
    photoCount: 1,
    gps: { lat: 3.81188, lng: 113.78203, accuracyM: 9 },
    recordedBy: "daniel",
    recordedAt: "2026-10-01T09:40",
    status: "published",
  },
  {
    id: "5e9a2c71-7f4b-4d2e-8c9a-3b6d1e5f7a04",
    speciesSlug: "shorea-macrophylla",
    heightM: 24,
    condition: "damaged",
    photoCount: 0,
    gps: { lat: 3.81873, lng: 113.77942, accuracyM: 14 },
    notes: "Bark damage on the north side.",
    recordedBy: "daniel",
    recordedAt: "2026-10-03T16:40",
    status: "waiting",
  },
  {
    id: "72c5f8a0-3e1d-4b9c-9f6a-8d2e4c1b7a06",
    speciesSlug: "durio-graveolens",
    heightM: 15,
    condition: "diseased",
    photoCount: 0,
    gps: null,
    notes: "Leaf spots on lower branches.",
    recordedBy: "mira",
    recordedAt: "2026-10-02T15:10",
    status: "published",
  },
  {
    id: "d4b86e13-9a2c-4e7f-b1d8-6c3a9f2e5b05",
    speciesSlug: "dryobalanops-aromatica",
    heightM: 35,
    condition: "healthy",
    photoCount: 0,
    gps: { lat: 3.80967, lng: 113.77655, accuracyM: 8 },
    recordedBy: "daniel",
    recordedAt: "2026-10-04T08:12",
    status: "waiting",
  },
];

export const publishedRecords = records.filter((r) => r.status === "published");

export function findPublishedByTag(code: string) {
  return publishedRecords.find((r) => tagCode(r.id) === code);
}

export function publishedForSpecies(slug: string) {
  return publishedRecords.filter((r) => r.speciesSlug === slug);
}

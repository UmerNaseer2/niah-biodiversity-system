// Fields follow the proposal draft. They will change once item 1 (database design) is done,
// so screens should read from these types instead of assuming field names.

export const PLANT_CONDITIONS = ['healthy', 'damaged', 'diseased', 'dead'] as const;

export type PlantCondition = (typeof PLANT_CONDITIONS)[number];

export type SyncStatus = 'pending' | 'synced';

export type GpsReading = {
  latitude: number;
  longitude: number;
  /** How far off the phone thinks the reading could be, in metres. */
  accuracyM: number;
  /** ISO 8601 timestamp. */
  capturedAt: string;
};

export type PlantRecord = {
  /** UUID made on the phone, so records and QR codes work without signal. */
  id: string;
  /** Short code printed on the tag, for typing in when the QR code won't scan. */
  tagCode: string;
  speciesName: string;
  commonName?: string;
  heightM?: number;
  condition: PlantCondition;
  notes?: string;
  location?: GpsReading;
  photoCount: number;
  /** ISO 8601 timestamp. */
  recordedAt: string;
  syncStatus: SyncStatus;
};

/** What the New Record form fills in. The rest is set when the record is saved. */
export type NewPlantRecord = Pick<
  PlantRecord,
  'speciesName' | 'commonName' | 'heightM' | 'condition' | 'notes' | 'location'
>;

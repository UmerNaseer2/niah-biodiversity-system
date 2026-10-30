// Fields follow the proposal draft. They will change once item 1 (database design) is done,
// so screens should read from these types instead of assuming field names.

export const PLANT_CONDITIONS = ['healthy', 'damaged', 'diseased', 'dead'] as const;

export type PlantCondition = (typeof PLANT_CONDITIONS)[number];

export type SyncStatus = 'pending' | 'synced';

/**
 * Why a record couldn't go up, when trying again won't fix it by itself and someone has to step
 * in. src/sync/upload-row.ts works out which one from the server's answer.
 * - tag-clash: a different record on the server already has this tag code.
 * - not-allowed: this account isn't allowed to upload records. Nothing is wrong with the record.
 * - rejected: the server turned the record down because a value broke one of its rules.
 */
export const UPLOAD_PROBLEMS = ['tag-clash', 'not-allowed', 'rejected'] as const;

export type UploadProblem = (typeof UPLOAD_PROBLEMS)[number];

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
  /** Links the record to the species list. Left out when the name typed in isn't on the list. */
  speciesSlug?: string;
  commonName?: string;
  heightM?: number;
  condition: PlantCondition;
  notes?: string;
  location?: GpsReading;
  photoCount: number;
  /** ISO 8601 timestamp. */
  recordedAt: string;
  syncStatus: SyncStatus;
  /** Why the last upload didn't go through. Only a pending record can have one. */
  uploadProblem?: UploadProblem;
};

/** What the New Record form fills in. The rest is set when the record is saved. */
export type NewPlantRecord = Pick<
  PlantRecord,
  'speciesName' | 'speciesSlug' | 'commonName' | 'heightM' | 'condition' | 'notes' | 'location'
>;

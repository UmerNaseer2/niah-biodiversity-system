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
 * - deleted: an officer deleted this record on the website, so the server won't take it again.
 */
export const UPLOAD_PROBLEMS = ['tag-clash', 'not-allowed', 'rejected', 'deleted'] as const;

export type UploadProblem = (typeof UPLOAD_PROBLEMS)[number];

/** What an officer decided about a record on the website. Same values as the server's status. */
export const REVIEW_STATUSES = ['waiting', 'published', 'rejected'] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

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
  /** What an officer decided, as of the last sync. Left out until the phone has heard. */
  reviewStatus?: ReviewStatus;
  /** The officer's reason, when the record was rejected. */
  reviewNotes?: string;
  /** The account that sent the record to the server. The website looks for its photos there. */
  uploadedBy?: string;
};

/**
 * Why a photo couldn't go up, when trying again won't fix it by itself.
 * - missing: the file isn't on the phone any more.
 * - rejected: the server turned the file down, because of its size or type.
 */
export const PHOTO_PROBLEMS = ['missing', 'rejected'] as const;

export type PhotoProblem = (typeof PHOTO_PROBLEMS)[number];

/** One photo taken with a record. */
export type RecordPhoto = {
  recordId: string;
  /** 1 for the first photo of the record. Also its file name on the server. */
  position: number;
  /** Where the file is, relative to the app's document folder. */
  path: string;
  /** ISO 8601 timestamp. Left out until the photo is on the server. */
  uploadedAt?: string;
  problem?: PhotoProblem;
};

/** What happened when a photo was sent, once the phone has an answer worth keeping. */
export type PhotoOutcome =
  { kind: 'uploaded'; uploadedAt: string } | { kind: 'problem'; problem: PhotoProblem };

/** What the New Record form fills in. The rest is set when the record is saved. */
export type NewPlantRecord = Pick<
  PlantRecord,
  'speciesName' | 'speciesSlug' | 'commonName' | 'heightM' | 'condition' | 'notes' | 'location'
>;

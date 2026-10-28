import { CONDITION_LABEL, type Condition } from "@/lib/condition";

// The record form, for editing a plant record (web/src/app/dashboard/records
// /[id]/edit). The form runs these checks before it sends, and the server
// action runs them again before it saves, so they live here where both can
// use them. The rules match the mobile app (mobile/src/lib/record-form.ts and
// height.ts) and the database (supabase/005_phone_sync.sql).

export type Values = {
  speciesName: string;
  commonName: string;
  /** Metres, as typed. Empty when the height isn't known */
  height: string;
  condition: Condition | "";
  notes: string;
  /** Park time for a datetime-local box, like 2026-10-02T10:24 */
  recordedAt: string;
  /** Degrees and metres as typed. All three empty means no location */
  lat: string;
  lng: string;
  accuracy: string;
};

export type FieldId =
  | "species-name"
  | "common-name"
  | "height"
  | "condition"
  | "notes"
  | "recorded-at"
  | "lat"
  | "lng"
  | "accuracy";
export type Errors = Partial<Record<FieldId, string>>;

export const FIELD_ORDER: FieldId[] = [
  "species-name",
  "common-name",
  "height",
  "condition",
  "recorded-at",
  "lat",
  "lng",
  "accuracy",
  "notes",
];

export const CONDITIONS = Object.keys(CONDITION_LABEL) as Condition[];

/** The most characters each text field takes, the same as the mobile app */
export const MAX = { speciesName: 120, commonName: 80, notes: 1000 };

// The tallest tree measured in Borneo is about 100 m, and the database keeps
// heights to 2 decimal places
export const MAX_HEIGHT_M = 120;
const MAX_HEIGHT_DECIMALS = 2;
// Digits with an optional dot or comma, like 12, 12.5, 12,5 or .5. Number() on
// its own would also take things like 1e2 or 0x10.
const DECIMAL = /^(\d+([.,]\d*)?|[.,]\d+)$/;
const SIGNED_DECIMAL = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;
const PARK_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** "  Shorea   macrophylla " becomes "Shorea macrophylla" */
export function tidy(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function toNumber(text: string) {
  return Number(text.trim().replace(",", "."));
}

/** What the database needs for the time. The park is 8 hours ahead of UTC */
export function recordedAtForDatabase(parkTime: string) {
  return `${parkTime}:00+08:00`;
}

function validParkTime(value: string) {
  if (!PARK_TIME.test(value)) return false;
  const [date] = value.split("T");
  const check = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().startsWith(date);
}

export function checkRecord(values: Values): Errors {
  const errors: Errors = {};

  const species = tidy(values.speciesName);
  if (!species) errors["species-name"] = "Enter the species name.";
  else if (species.length > MAX.speciesName) {
    errors["species-name"] = `The species name can be up to ${MAX.speciesName} characters.`;
  }

  if (tidy(values.commonName).length > MAX.commonName) {
    errors["common-name"] = `The common name can be up to ${MAX.commonName} characters.`;
  }

  const height = values.height.trim();
  if (height) {
    if (!DECIMAL.test(height)) {
      errors.height = "Write the height in metres, like 12.5.";
    } else {
      const value = toNumber(height);
      const decimals = (height.split(/[.,]/)[1] ?? "").replace(/0+$/, "");
      if (value <= 0 || value > MAX_HEIGHT_M) {
        errors.height = `The height has to be more than 0 and at most ${MAX_HEIGHT_M} m.`;
      } else if (decimals.length > MAX_HEIGHT_DECIMALS) {
        errors.height = `Use at most ${MAX_HEIGHT_DECIMALS} decimal places.`;
      }
    }
  }

  if (!CONDITIONS.includes(values.condition as Condition)) {
    errors.condition = "Choose the condition.";
  }

  if (!validParkTime(values.recordedAt)) {
    errors["recorded-at"] = "Enter the date and time it was recorded.";
  }

  if (values.notes.trim().length > MAX.notes) {
    errors.notes = `Notes can be up to ${MAX.notes} characters.`;
  }

  // The location is all or nothing, because the database wants a lat, a lng
  // and an accuracy together
  const place = [values.lat, values.lng, values.accuracy].map((v) => v.trim());
  if (place.some(Boolean)) {
    const [lat, lng, accuracy] = place;
    const range = (text: string, limit: number) =>
      SIGNED_DECIMAL.test(text) && Math.abs(toNumber(text)) <= limit;
    if (!lat) errors.lat = "Enter the latitude, or clear the whole location.";
    else if (!range(lat, 90)) errors.lat = "The latitude is a number from -90 to 90.";
    if (!lng) errors.lng = "Enter the longitude, or clear the whole location.";
    else if (!range(lng, 180)) errors.lng = "The longitude is a number from -180 to 180.";
    if (!accuracy) errors.accuracy = "Enter the accuracy in metres, or clear the whole location.";
    else if (!DECIMAL.test(accuracy) || toNumber(accuracy) > 100000) {
      errors.accuracy = "The accuracy is a number of metres, like 8.";
    }
  }

  return errors;
}

/**
 * What goes in the records table. The reading time (capturedAt) is kept from
 * the original GPS reading, and the species link is worked out by the action.
 */
export function rowFromValues(values: Values, capturedAt?: string) {
  const hasPlace = [values.lat, values.lng, values.accuracy].some((v) => v.trim());
  return {
    species_name: tidy(values.speciesName),
    common_name: tidy(values.commonName) || null,
    height_m: values.height.trim() ? toNumber(values.height) : null,
    condition: values.condition,
    notes: values.notes.trim() || null,
    recorded_at: recordedAtForDatabase(values.recordedAt),
    gps: hasPlace
      ? {
          lat: toNumber(values.lat),
          lng: toNumber(values.lng),
          accuracyM: toNumber(values.accuracy),
          ...(capturedAt ? { capturedAt } : {}),
        }
      : null,
  };
}

/** The values as they'd look after saving, so the form shows what's stored */
export function tidyValues(values: Values): Values {
  return {
    ...values,
    speciesName: tidy(values.speciesName),
    commonName: tidy(values.commonName),
    height: values.height.trim().replace(",", "."),
    notes: values.notes.trim(),
    lat: values.lat.trim().replace(",", "."),
    lng: values.lng.trim().replace(",", "."),
    accuracy: values.accuracy.trim().replace(",", "."),
  };
}

export function valuesFromFormData(formData: FormData): Values {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    speciesName: text("speciesName"),
    commonName: text("commonName"),
    height: text("height"),
    condition: text("condition") as Condition | "",
    notes: text("notes"),
    recordedAt: text("recordedAt"),
    lat: text("lat"),
    lng: text("lng"),
    accuracy: text("accuracy"),
  };
}

/** Record IDs are UUIDs, so anything else can't be a record */
export const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idFromFormData(formData: FormData) {
  const id = formData.get("id");
  return typeof id === "string" && RECORD_ID.test(id) ? id : "";
}

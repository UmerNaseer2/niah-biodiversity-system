import type { Species } from "@/data/species";
import {
  IUCN,
  isIucnCode,
  showsExactSpot,
  type IucnCode,
} from "@/lib/iucn";

// The species form, for adding a species (web/src/app/dashboard/species/new)
// and editing one ([slug]/edit). The page runs these checks before it sends
// the form, and the server action runs them again before it saves, so they
// live here where both can use them.

export type Values = {
  scientificName: string;
  authority: string;
  family: string;
  commonNames: string;
  iucn: IucnCode | "";
  sarawakProtected: boolean;
  visibility: "exact" | "rough";
  summary: string;
  about: string;
};

// Only the fields that can have an error, in the order they appear
export type FieldId =
  | "scientific-name"
  | "authority"
  | "family"
  | "common-names"
  | "iucn"
  | "summary"
  | "about";
export type Errors = Partial<Record<FieldId, string>>;

export const EMPTY: Values = {
  scientificName: "",
  authority: "",
  family: "",
  commonNames: "",
  iucn: "",
  sarawakProtected: false,
  visibility: "exact",
  summary: "",
  about: "",
};

export const FIELD_ORDER: FieldId[] = [
  "scientific-name",
  "authority",
  "family",
  "common-names",
  "iucn",
  "summary",
  "about",
];

/** The most characters each text field takes */
export const MAX = {
  scientificName: 100,
  authority: 100,
  family: 60,
  commonNames: 300,
  summary: 200,
  about: 2000,
};

/** A genus and species, like Shorea macrophylla or Hibiscus rosa-sinensis */
export const SCIENTIFIC_NAME = /^[A-Z][a-z]+ [a-z]+(-[a-z]+)?$/;

/** "shorea   macrophylla " becomes "shorea macrophylla" */
export function tidy(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function splitNames(value: string) {
  return value
    .split(",")
    .map(tidy)
    .filter(Boolean);
}

/** Shorea macrophylla becomes shorea-macrophylla, for the species page link */
export function slugFor(scientificName: string) {
  return tidy(scientificName).toLowerCase().replace(/ /g, "-");
}

/** Why the exact spot can't be shown, or null when it's up to the officer */
export function lockReason(iucn: IucnCode | "", sarawakProtected: boolean) {
  if (iucn === "" || showsExactSpot(iucn, false, false)) {
    return sarawakProtected
      ? "Protected species always get a rough area only."
      : null;
  }
  const label = IUCN[iucn].label;
  return sarawakProtected
    ? `${label} and protected species always get a rough area only.`
    : `${label} species always get a rough area only.`;
}

/** The checks for a new species. existingNames are the scientific names
 *  already in the database. */
export function checkNewSpecies(values: Values, existingNames: string[]) {
  const errors: Errors = {};
  const name = tidy(values.scientificName);

  if (!name) {
    errors["scientific-name"] = "Enter the scientific name.";
  } else if (name.length > MAX.scientificName) {
    errors["scientific-name"] =
      `The scientific name can be up to ${MAX.scientificName} characters.`;
  } else if (!SCIENTIFIC_NAME.test(name)) {
    errors["scientific-name"] =
      "Write the genus then the species, like Shorea macrophylla.";
  } else if (
    existingNames.some((existing) => existing.toLowerCase() === name.toLowerCase())
  ) {
    errors["scientific-name"] = `${name} is already in the database.`;
  }

  return { ...errors, ...checkDetails(values) };
}

/** The checks for everything but the scientific name, which can't change once
 *  a species is added, so editing a species only runs these */
export function checkDetails(values: Values) {
  const errors: Errors = {};
  const family = tidy(values.family);
  const summary = tidy(values.summary);

  if (tidy(values.authority).length > MAX.authority) {
    errors.authority = `The authority can be up to ${MAX.authority} characters.`;
  }

  if (!family) {
    errors.family = "Enter the family.";
  } else if (family.length > MAX.family) {
    errors.family = `The family can be up to ${MAX.family} characters.`;
  } else if (!/^[A-Z][a-z]+$/.test(family)) {
    errors.family =
      "Write the family as one word with a capital letter, like Dipterocarpaceae.";
  }

  if (splitNames(values.commonNames).length === 0) {
    errors["common-names"] = "Enter at least one common name.";
  } else if (values.commonNames.length > MAX.commonNames) {
    errors["common-names"] =
      `The common names can be up to ${MAX.commonNames} characters.`;
  }

  if (!isIucnCode(values.iucn)) errors.iucn = "Choose the IUCN status.";

  if (!summary) {
    errors.summary = "Write a one sentence summary.";
  } else if (summary.length > MAX.summary) {
    errors.summary = `The summary can be up to ${MAX.summary} characters.`;
  }

  if (values.about.trim().length > MAX.about) {
    errors.about = `About can be up to ${MAX.about} characters.`;
  }

  return errors;
}

/** The form filled in with a species from the database, for editing it.
 *  about is the about column on its own. Species falls back to the
 *  description when about is empty, and saving shouldn't copy that across.
 *  A threatened or protected species starts on rough area only, so its exact
 *  spot stays hidden if the officer makes it Least Concern, until they choose
 *  to show it. */
export function valuesFromSpecies(species: Species, about: string): Values {
  return {
    scientificName: species.scientificName,
    authority: species.authority,
    family: species.family,
    commonNames: species.commonNames.join(", "),
    iucn: species.iucn,
    sarawakProtected: species.sarawakProtected,
    visibility:
      species.roughAreaOnly || lockReason(species.iucn, species.sarawakProtected)
        ? "rough"
        : "exact",
    summary: species.summary,
    about,
  };
}

/** The columns both forms save, for the species table */
export function rowFromValues(values: Values) {
  return {
    authority: tidy(values.authority) || null,
    family: tidy(values.family),
    common_names: splitNames(values.commonNames),
    iucn_code: values.iucn,
    sarawak_protected: values.sarawakProtected,
    // A threatened or protected species is saved as rough area only as well,
    // so it stays hidden if its status changes later, until an officer decides
    rough_area_only:
      Boolean(lockReason(values.iucn, values.sarawakProtected)) ||
      values.visibility === "rough",
    summary: tidy(values.summary),
    about: values.about.trim() || null,
  };
}

/** The form filled in with what was saved, tidied up the same way, so editing
 *  it more starts from what the database has */
export function tidyValues(values: Values): Values {
  const row = rowFromValues(values);
  return {
    scientificName: tidy(values.scientificName),
    authority: row.authority ?? "",
    family: row.family,
    commonNames: row.common_names.join(", "),
    iucn: values.iucn,
    sarawakProtected: values.sarawakProtected,
    visibility: row.rough_area_only ? "rough" : "exact",
    summary: row.summary,
    about: row.about ?? "",
  };
}

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  // A form sends line breaks as \r\n, but the browser counts them as \n
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n") : "";
}

/** What the form sent, read from its field names */
export function valuesFromFormData(formData: FormData): Values {
  const iucn = text(formData, "iucn");
  return {
    scientificName: text(formData, "scientificName"),
    authority: text(formData, "authority"),
    family: text(formData, "family"),
    commonNames: text(formData, "commonNames"),
    iucn: isIucnCode(iucn) ? iucn : "",
    sarawakProtected: text(formData, "sarawakProtected") === "on",
    visibility: text(formData, "visibility") === "rough" ? "rough" : "exact",
    summary: text(formData, "summary"),
    about: text(formData, "about"),
  };
}

/** The species the edit and delete forms are about, which they send as slug */
export function slugFromFormData(formData: FormData) {
  return text(formData, "slug").trim();
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY,
  MAX,
  checkDetails,
  rowFromValues,
  tidyValues,
  valuesFromFormData,
} from "../src/lib/species-form.ts";

const filled = {
  ...EMPTY,
  scientificName: "Shorea macrophylla",
  family: "Dipterocarpaceae",
  commonNames: "Engkabang",
  iucn: "VU",
  summary: "A big riverside tree.",
};

test("Where it grows and How people use it are optional", () => {
  assert.deepEqual(checkDetails(filled), {});
  const row = rowFromValues(filled);
  // Left empty, they're saved as nothing so the species page leaves the sections out
  assert.equal(row.habitat, null);
  assert.equal(row.uses, null);
});

test("Where it grows and How people use it are saved trimmed, on add and edit", () => {
  const values = {
    ...filled,
    habitat: "  Riverbanks that flood.\n",
    uses: " Illipe butter from the nuts. ",
  };
  const row = rowFromValues(values);
  assert.equal(row.habitat, "Riverbanks that flood.");
  assert.equal(row.uses, "Illipe butter from the nuts.");
  // The form comes back with what was saved
  const tidied = tidyValues(values);
  assert.equal(tidied.habitat, "Riverbanks that flood.");
  assert.equal(tidied.uses, "Illipe butter from the nuts.");
});

test("Where it grows and How people use it have a length limit", () => {
  const errors = checkDetails({
    ...filled,
    habitat: "a".repeat(MAX.habitat + 1),
    uses: "b".repeat(MAX.uses + 1),
  });
  assert.match(errors.habitat, /Where it grows can be up to 1000 characters/);
  assert.match(errors.uses, /How people use it can be up to 1000 characters/);
  // Exactly at the limit is fine
  assert.deepEqual(
    checkDetails({ ...filled, habitat: "a".repeat(MAX.habitat), uses: "b".repeat(MAX.uses) }),
    {},
  );
});

test("the form sends habitat and uses by those names", () => {
  const form = new FormData();
  form.set("habitat", "Peat swamp\r\nand heath forest");
  form.set("uses", "Cooking pots");
  const values = valuesFromFormData(form);
  assert.equal(values.habitat, "Peat swamp\nand heath forest");
  assert.equal(values.uses, "Cooking pots");
});

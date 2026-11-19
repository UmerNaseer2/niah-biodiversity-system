import test from "node:test";
import assert from "node:assert/strict";
import {
  findSpeciesByName,
  MAX_SUGGESTIONS,
  normaliseName,
  searchSpecies,
  speciesOptionFromRow,
} from "../src/lib/species-search.ts";

const LIST = [
  { slug: "eusideroxylon-zwageri", scientificName: "Eusideroxylon zwageri", commonNames: ["Belian", "Borneo ironwood"] },
  { slug: "shorea-macrophylla", scientificName: "Shorea macrophylla", commonNames: ["Engkabang", "Illipe nut tree"] },
  { slug: "shorea-curtisii", scientificName: "Shorea curtisii", commonNames: ["Seraya"] },
  { slug: "nepenthes-ampullaria", scientificName: "Nepenthes ampullaria", commonNames: ["Pitcher plant"] },
  { slug: "dryobalanops-aromatica", scientificName: "Dryobalanops aromatica", commonNames: [] },
];

const slugs = (options) => options.map((option) => option.slug);

test("capitals and extra spaces don't count", () => {
  assert.equal(normaliseName("  Shorea   MACROPHYLLA "), "shorea macrophylla");
  assert.deepEqual(slugs(searchSpecies("SHOR", LIST)), ["shorea-macrophylla", "shorea-curtisii"]);
  assert.deepEqual(slugs(searchSpecies("shor", LIST)), ["shorea-macrophylla", "shorea-curtisii"]);
  assert.equal(findSpeciesByName(" shorea  macrophylla ", LIST)?.slug, "shorea-macrophylla");
  assert.equal(findSpeciesByName("SHOREA MACROPHYLLA", LIST)?.slug, "shorea-macrophylla");
});

test("the start of any word in the scientific or a common name finds the species", () => {
  assert.deepEqual(slugs(searchSpecies("macro", LIST)), ["shorea-macrophylla"]);
  assert.deepEqual(slugs(searchSpecies("ironwood", LIST)), ["eusideroxylon-zwageri"]);
  assert.deepEqual(slugs(searchSpecies("Pitcher", LIST)), ["nepenthes-ampullaria"]);
  // The middle of a word doesn't count, or "an" would find most of the list
  assert.deepEqual(searchSpecies("phylla", LIST), []);
});

test("scientific name matches come before common name matches", () => {
  const list = [
    { slug: "a", scientificName: "Alpha one", commonNames: ["Seraya tree"] },
    { slug: "b", scientificName: "Seraya two", commonNames: [] },
  ];
  assert.deepEqual(slugs(searchSpecies("ser", list)), ["b", "a"]);
});

test("nothing is suggested for one letter, and only a few at a time", () => {
  assert.deepEqual(searchSpecies("s", LIST), []);
  assert.deepEqual(searchSpecies("   ", LIST), []);
  const many = Array.from({ length: 12 }, (_, i) => ({
    slug: `s${i}`,
    scientificName: `Shorea number${i}`,
    commonNames: [],
  }));
  assert.equal(searchSpecies("shorea", many).length, MAX_SUGGESTIONS);
});

test("a name that isn't on the list has no match", () => {
  assert.equal(findSpeciesByName("Shorea", LIST), undefined);
  assert.equal(findSpeciesByName("", LIST), undefined);
  assert.equal(findSpeciesByName("Unknown fern", LIST), undefined);
});

test("speciesOptionFromRow reads a species_staff row and skips one with no name", () => {
  assert.deepEqual(
    speciesOptionFromRow({
      id: "shorea-macrophylla",
      scientific_name: " Shorea macrophylla ",
      common_names: ["Engkabang", "", null],
    }),
    { slug: "shorea-macrophylla", scientificName: "Shorea macrophylla", commonNames: ["Engkabang"] },
  );
  assert.deepEqual(speciesOptionFromRow({ id: "x", scientific_name: "X y", common_names: null }), {
    slug: "x",
    scientificName: "X y",
    commonNames: [],
  });
  assert.equal(speciesOptionFromRow({ id: "x", scientific_name: "" }), null);
  assert.equal(speciesOptionFromRow({ scientific_name: "X y" }), null);
});

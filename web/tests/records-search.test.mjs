import test from "node:test";
import assert from "node:assert/strict";
import {
  containsPattern,
  SEARCH_MAX,
  searchFilter,
  searchTermFrom,
} from "../src/lib/records-search.ts";

test("searchTermFrom trims, joins spaces and caps the length", () => {
  assert.equal(searchTermFrom("  belian   tree "), "belian tree");
  assert.equal(searchTermFrom(""), null);
  assert.equal(searchTermFrom("   "), null);
  assert.equal(searchTermFrom(undefined), null);
  assert.equal(searchTermFrom(["a", "b"]), null);
  assert.equal(searchTermFrom("x".repeat(500)).length, SEARCH_MAX);
  // * would be a wildcard to the API, so it counts as a space
  assert.equal(searchTermFrom("NNP-*"), "NNP-");
  assert.equal(searchTermFrom("***"), null);
});

test("containsPattern makes % and _ match only themselves", () => {
  assert.equal(containsPattern("NNP-3F2A"), "%NNP-3F2A%");
  assert.equal(containsPattern("50%"), "%50\\%%");
  assert.equal(containsPattern("a_b"), "%a\\_b%");
  assert.equal(containsPattern("c:\\x"), "%c:\\\\x%");
});

test("searchFilter looks in every column, with each value quoted", () => {
  assert.equal(
    searchFilter("belian"),
    'tag_code.ilike."%belian%",species_name.ilike."%belian%",' +
      'common_name.ilike."%belian%",notes.ilike."%belian%"',
  );
  // Commas and brackets stay inside the quotes, and a quote or backslash is escaped
  const filter = searchFilter('a,b) "c" 5%');
  assert.ok(filter.startsWith('tag_code.ilike."%a,b) \\"c\\" 5\\\\%%",'));
  assert.equal(filter.split(".ilike.").length, 5);
});

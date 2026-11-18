import test from "node:test";
import assert from "node:assert/strict";
import { codeOnlyReason } from "../src/lib/code-only-tag.ts";
import { tagQrText } from "../src/lib/tags.ts";

const common = {
  scientificName: "Shorea macrophylla",
  iucn: "LC",
  sarawakProtected: false,
  roughAreaOnly: false,
};

test("a common species whose exact spot is public gets a link on its tag", () => {
  assert.equal(codeOnlyReason("Shorea macrophylla", common), null);
  assert.equal(codeOnlyReason("Shorea macrophylla", { ...common, iucn: "NT" }), null);
  // Capitals and extra spaces don't count, the same as records_public
  assert.equal(codeOnlyReason("  shorea   MACROPHYLLA ", common), null);
  // An older species row with no rough area flag counts as not set
  const noFlag = { ...common };
  delete noFlag.roughAreaOnly;
  assert.equal(codeOnlyReason("Shorea macrophylla", noFlag), null);
});

test("protected, threatened and unknown species get a code only tag, and say why", () => {
  const protectedOne = codeOnlyReason("Shorea macrophylla", { ...common, sarawakProtected: true });
  assert.equal(
    protectedOne,
    "This species is protected, so its tag holds only the code. Staff can scan it in the Niah app.",
  );
  for (const iucn of ["VU", "EN", "CR"]) {
    assert.match(codeOnlyReason("Shorea macrophylla", { ...common, iucn }), /^This species is threatened, so its tag holds only the code\./);
  }
  for (const iucn of ["DD", "NE"]) {
    assert.match(codeOnlyReason("Shorea macrophylla", { ...common, iucn }), /risk isn’t known yet, so its tag holds only the code\./);
  }
  assert.match(
    codeOnlyReason("Shorea macrophylla", { ...common, roughAreaOnly: true }),
    /rough area on the map, so its tag holds only the code\./,
  );
  // Protected comes first when it's threatened as well
  assert.match(codeOnlyReason("Shorea macrophylla", { ...common, iucn: "CR", sarawakProtected: true }), /protected/);
});

test("a plant with no species, or a name that isn't its species, gets a code only tag", () => {
  assert.match(codeOnlyReason("Shorea macrophylla", null), /isn’t matched to a species yet/);
  assert.match(codeOnlyReason("Shorea macrophylla", undefined), /isn’t matched to a species yet/);
  assert.match(codeOnlyReason("Shorea curtisii", common), /name doesn’t match its species/);
});

test("every reason is one line that ends by saying staff can still scan it", () => {
  for (const reason of [
    codeOnlyReason("x", null),
    codeOnlyReason("x", common),
    codeOnlyReason("Shorea macrophylla", { ...common, iucn: "EN" }),
  ]) {
    assert.ok(!reason.includes("\n"));
    assert.ok(reason.endsWith("Staff can scan it in the Niah app."));
    assert.ok(!/[–—]/.test(reason), "no long dashes");
  }
});

test("tagQrText leaves the web address out of a code only tag", () => {
  const before = process.env.SITE_URL;
  try {
    process.env.SITE_URL = "https://niah.example.org/";
    assert.equal(tagQrText("NNP-3F2A9C"), "https://niah.example.org/tag/NNP-3F2A9C");
    assert.equal(tagQrText("NNP-3F2A9C", { codeOnly: false }), "https://niah.example.org/tag/NNP-3F2A9C");
    assert.equal(tagQrText("NNP-3F2A9C", { codeOnly: true }), "NNP-3F2A9C");
    delete process.env.SITE_URL;
    assert.equal(tagQrText("NNP-3F2A9C"), "NNP-3F2A9C");
  } finally {
    if (before === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = before;
  }
});

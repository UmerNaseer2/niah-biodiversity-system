// Mock species for the wireframe. The IUCN statuses were checked against
// public sources on 4 Oct 2026, but SFC should confirm them (and the text)
// before any of this goes live. Item 14 moves this into Supabase.

import { IUCN, type IucnCode } from "@/lib/iucn";

export type Species = {
  slug: string;
  scientificName: string;
  authority: string;
  family: string;
  /** The first one is the name we show on cards and tags */
  commonNames: string[];
  iucn: IucnCode;
  /** Listed as a protected plant under the Sarawak Wild Life Protection Ordinance 1998 */
  sarawakProtected: boolean;
  newerName?: string;
  summary: string;
  about: string;
  habitat: string;
  uses: string;
  updated: string;
};

export const species: Species[] = [
  {
    slug: "eusideroxylon-zwageri",
    scientificName: "Eusideroxylon zwageri",
    authority: "Teijsm. & Binn.",
    family: "Lauraceae",
    commonNames: ["Belian", "Borneo ironwood"],
    iucn: "VU",
    sarawakProtected: false,
    summary: "A slow growing hardwood with timber so dense it sinks in water.",
    about:
      "Belian is a big, slow growing tree of lowland forest. Its wood is one of the heaviest and hardest in Borneo and it hardly rots, so posts and roof shingles made from it can last for generations.",
    habitat: "Lowland rainforest in Borneo and nearby islands, mostly on well drained soil.",
    uses: "Posts, piles, bridges and roof shingles. Many older longhouses stand on belian posts.",
    updated: "2026-10-02",
  },
  {
    slug: "nepenthes-ampullaria",
    scientificName: "Nepenthes ampullaria",
    authority: "Jack",
    family: "Nepenthaceae",
    commonNames: ["Pitcher plant", "Periuk kera"],
    iucn: "LC",
    sarawakProtected: true,
    summary: "A pitcher plant whose round pitchers sit in clusters on the forest floor.",
    about:
      "Most pitcher plants hang their pitchers from vines, but this one makes most of them at ground level, in tight clusters that can carpet the forest floor. The small lid stays folded back, so the pitchers catch falling leaves as well as insects.",
    habitat: "Shady, wet places such as peat swamp forest and heath forest (kerangas).",
    uses: "In parts of Borneo the pitchers of this and other Nepenthes are used as small pots for cooking rice.",
    updated: "2026-10-01",
  },
  {
    slug: "koompassia-excelsa",
    scientificName: "Koompassia excelsa",
    authority: "(Becc.) Taub.",
    family: "Fabaceae",
    commonNames: ["Tapang"],
    iucn: "NT",
    sarawakProtected: false,
    summary: "One of the tallest trees in the tropics, with a smooth pale trunk.",
    about:
      "Tapang can grow past 80 m, which puts it among the tallest tropical trees in the world. The trunk is straight, smooth and pale grey with big buttresses at the base, and the crown sits well above the rest of the canopy.",
    habitat: "Lowland rainforest from southern Thailand to Borneo.",
    uses: "Wild honey bees hang their combs from the high branches and honey hunters climb up to collect it, so people often leave tapang standing when they clear land.",
    updated: "2026-10-01",
  },
  {
    slug: "shorea-macrophylla",
    scientificName: "Shorea macrophylla",
    authority: "(de Vriese) P.S.Ashton",
    family: "Dipterocarpaceae",
    commonNames: ["Engkabang", "Illipe nut tree"],
    iucn: "VU",
    sarawakProtected: false,
    newerName: "Rubroshorea macrophylla",
    summary: "A riverside dipterocarp whose seeds are the illipe nuts.",
    about:
      "Engkabang is a dipterocarp that does well along rivers and on land that floods for part of the year. In good years it fruits heavily, and its large winged seeds are the illipe nuts that people collect.",
    habitat: "Riverbanks and flat land that floods from time to time.",
    uses: "Fat pressed from the nuts, often called illipe butter, goes into cooking, chocolate and cosmetics.",
    updated: "2026-10-03",
  },
  {
    slug: "durio-graveolens",
    scientificName: "Durio graveolens",
    authority: "Becc.",
    family: "Malvaceae",
    commonNames: ["Durian kuning", "Red-fleshed durian"],
    iucn: "VU",
    sarawakProtected: false,
    summary: "A wild durian with red, orange or yellow flesh.",
    about:
      "A wild relative of the durian sold in markets. The fruit has the same spiky husk, but the flesh inside can be red, orange or yellow instead of pale cream.",
    habitat: "Lowland rainforest in Borneo and nearby areas.",
    uses: "People living near the forest eat the fruit fresh.",
    updated: "2026-10-02",
  },
  {
    slug: "dryobalanops-aromatica",
    scientificName: "Dryobalanops aromatica",
    authority: "C.F.Gaertn.",
    family: "Dipterocarpaceae",
    commonNames: ["Kapur", "Borneo camphor"],
    iucn: "VU",
    sarawakProtected: false,
    summary: "A tall dipterocarp known for crown shyness and Borneo camphor.",
    about:
      "Kapur grows into a tall, straight tree. Neighbouring crowns often stop just short of touching and leave thin lines of sky between them, which is called crown shyness. Crystals that form inside the trunk are the old trade good known as Borneo camphor.",
    habitat: "Lowland dipterocarp forest on well drained soil.",
    uses: "Timber sold as kapur for building, and camphor used in traditional medicine.",
    updated: "2026-10-04",
  },
];

export function getSpecies(slug: string) {
  return species.find((s) => s.slug === slug);
}

/**
 * Exact locations stay with staff for threatened species (VU and above) and
 * for anything protected under Sarawak law. The public only gets a rough
 * square. In the real build a database view does this, not the page.
 */
export function hidesLocation(s: Species) {
  return s.sarawakProtected || IUCN[s.iucn].threatened;
}

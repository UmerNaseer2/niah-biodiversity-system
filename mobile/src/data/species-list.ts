// Species the New Record form suggests while you type. It's every species in
// supabase/002_seed_data.sql plus the two extra ones on the website mock list
// (web/src/data/species.ts), so every mock record links to a species. Names only, never locations.
// The common names follow the fixes in supabase/007_species_fixes.sql.
// The form only uses this list until the phone first syncs. After that it uses the species list
// downloaded from Supabase and saved on the phone (src/db), so a new species added on the website
// shows up without an app update. Item 10 adds the download.

export type SpeciesOption = {
  /** Same as species.id and species.slug in Supabase. */
  slug: string;
  scientificName: string;
  /** The first one is the one the form fills in. */
  commonNames: string[];
};

export const SPECIES_LIST: SpeciesOption[] = [
  {
    slug: 'eusideroxylon-zwageri',
    scientificName: 'Eusideroxylon zwageri',
    commonNames: ['Belian', 'Borneo ironwood', 'Tebelian', 'Kayu Besi'],
  },
  {
    slug: 'nepenthes-ampullaria',
    scientificName: 'Nepenthes ampullaria',
    commonNames: ['Pitcher plant', 'Periuk kera'],
  },
  {
    slug: 'koompassia-excelsa',
    scientificName: 'Koompassia excelsa',
    commonNames: ['Tapang', 'Tualang'],
  },
  {
    slug: 'shorea-macrophylla',
    scientificName: 'Shorea macrophylla',
    commonNames: ['Engkabang', 'Engkabang jantong', 'Kawang jantong', 'Illipe nut tree'],
  },
  {
    slug: 'dipterocarpus-sarawakensis',
    scientificName: 'Dipterocarpus sarawakensis',
    commonNames: ['Keruing sarawak', 'Keruing'],
  },
  {
    slug: 'paphiopedilum-barbatum',
    scientificName: 'Paphiopedilum barbatum',
    commonNames: ['Slipper orchid', 'Bunga kasut', 'Anggerik kasut'],
  },
  {
    slug: 'durio-graveolens',
    scientificName: 'Durio graveolens',
    commonNames: ['Durian kuning', 'Red-fleshed durian'],
  },
  {
    slug: 'dryobalanops-aromatica',
    scientificName: 'Dryobalanops aromatica',
    commonNames: ['Kapur', 'Borneo camphor'],
  },
];

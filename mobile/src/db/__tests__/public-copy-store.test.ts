import { deleteDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

import type { SpeciesOption } from '@/data/species-list';
import { DATABASE_NAME } from '@/db/database';
import { EMPTY_PUBLIC_COPY, openRecordsStore, type RecordsStore } from '@/db/records-store';
import type { PlantCondition, PlantRecord } from '@/types/plant-record';
import type { IucnCode, NewPublicPhoto, PublicRecord, PublicSpecies } from '@/types/public-copy';

// The copy of the public plant info that visitors scan tags with, and the tags this phone scanned.
// The text is made up for these tests, and like the real copy nothing here has a location.

// A species with every field filled in, and one with only the fields that have to be there.
const pitcher: PublicSpecies = {
  slug: 'nepenthes-rafflesiana',
  scientificName: 'Nepenthes rafflesiana',
  authority: 'Jack',
  family: 'Nepenthaceae',
  commonNames: ['Raffles pitcher plant', 'Periuk kera'],
  iucnCode: 'LC',
  sarawakProtected: true,
  newerName: 'Nepenthes new-name',
  summary: 'A pitcher plant that traps insects.',
  about: 'Its pitchers hold a liquid that breaks down whatever falls in.',
  habitat: 'Forest edges and open heath forest.',
  uses: 'None recorded here.',
};
const fig: PublicSpecies = {
  slug: 'ficus-benjamina',
  scientificName: 'Ficus benjamina',
  authority: '',
  family: '',
  commonNames: [],
  iucnCode: 'NE',
  sarawakProtected: false,
  summary: '',
  about: '',
  habitat: '',
  uses: '',
};

// The same for records.
const tagged: PublicRecord = {
  id: '3f9a1c2e-5b7d-4e6f-8a9b-0c1d2e3f4a50',
  tagCode: 'NNP-3F9A1C',
  speciesSlug: 'nepenthes-rafflesiana',
  speciesName: 'Nepenthes rafflesiana',
  commonName: 'Raffles pitcher plant',
  heightM: 1.5,
  condition: 'healthy',
  recordedAt: '2026-10-20T02:30:00.000Z',
};
const unmatched: PublicRecord = {
  id: '8d2e4f6a-1c3b-4d5e-9f7a-2b4c6d8e0f10',
  tagCode: 'NNP-8D2E4F',
  speciesName: 'Ficus sp.',
  recordedAt: '2026-10-19T16:00:00.000Z',
};

// A made-up main photo for each species.
const pitcherPhoto: NewPublicPhoto = {
  speciesSlug: 'nepenthes-rafflesiana',
  url: 'https://images.example/pitcher.jpg',
  caption: 'A pitcher on its vine.',
  credit: 'Park staff',
};
const figPhoto: NewPublicPhoto = {
  speciesSlug: 'ficus-benjamina',
  url: 'https://images.example/fig.jpg',
  caption: '',
  credit: '',
};
// The names of their copies on the phone once they've come down.
const PITCHER_FILE = 'pitcher-copy';
const FIG_FILE = 'fig-copy';

const DOWNLOADED = '2026-11-04T06:15:00.000Z';
const LATER = '2026-11-04T06:25:00.000Z';

const oldCopy = { species: [pitcher], records: [tagged], downloadedAt: DOWNLOADED };

let store: RecordsStore;

beforeEach(async () => {
  await deleteDatabaseAsync(DATABASE_NAME);
  store = await openRecordsStore();
});

afterEach(async () => {
  await store.close();
});

describe('public plant info', () => {
  it('has nothing and no time until the first download', async () => {
    expect(await store.loadPublicCopy()).toEqual({ species: [], records: [], downloadedAt: null });
  });

  it('gives back every field the way it came down, in the same order', async () => {
    await store.replacePublicCopy([fig, pitcher], [unmatched, tagged], DOWNLOADED);
    expect(await store.loadPublicCopy()).toEqual({
      species: [fig, pitcher],
      records: [unmatched, tagged],
      downloadedAt: DOWNLOADED,
    });
  });

  it('gives back empty fields as missing, not as null', async () => {
    await store.replacePublicCopy([fig], [unmatched], DOWNLOADED);
    const { species, records } = await store.loadPublicCopy();
    expect(Object.values(species[0])).not.toContain(null);
    expect(Object.values(records[0])).not.toContain(null);
  });

  it('swaps the whole copy and its time for the new one', async () => {
    await store.replacePublicCopy([fig, pitcher], [unmatched, tagged], DOWNLOADED);
    await store.replacePublicCopy([pitcher], [tagged], LATER);
    expect(await store.loadPublicCopy()).toEqual({
      species: [pitcher],
      records: [tagged],
      downloadedAt: LATER,
    });
  });

  // The park might not have published any records yet.
  it('takes a download with species and no records', async () => {
    await store.replacePublicCopy([fig, pitcher], [unmatched, tagged], DOWNLOADED);
    await store.replacePublicCopy([pitcher], [], LATER);
    expect(await store.loadPublicCopy()).toEqual({
      species: [pitcher],
      records: [],
      downloadedAt: LATER,
    });
  });

  it('keeps the old copy and its time when the new one has no species', async () => {
    await store.replacePublicCopy([pitcher], [tagged], DOWNLOADED);
    await expect(store.replacePublicCopy([], [unmatched], LATER)).rejects.toThrow(
      EMPTY_PUBLIC_COPY,
    );
    expect(await store.loadPublicCopy()).toEqual(oldCopy);
  });

  it.each<[string, PublicSpecies[], PublicRecord[], string]>([
    [
      'the same species twice',
      [pitcher, fig, pitcher],
      [],
      'UNIQUE constraint failed: public_species.slug',
    ],
    ['a species with no slug', [fig, { ...pitcher, slug: '' }], [], 'CHECK constraint failed'],
    ['a species with no name', [fig, { ...pitcher, scientificName: '' }], [], 'CHECK constraint'],
    [
      'an IUCN code the app does not know',
      [fig, { ...pitcher, iucnCode: 'XX' as IucnCode }],
      [],
      'CHECK constraint failed',
    ],
    [
      'the same record twice',
      [fig],
      [tagged, unmatched, tagged],
      'UNIQUE constraint failed: public_records.id',
    ],
    ['a record with no tag', [fig], [unmatched, { ...tagged, tagCode: '' }], 'CHECK constraint'],
    ['a record with no name', [fig], [{ ...tagged, speciesName: '' }], 'CHECK constraint failed'],
    ['a height of 0', [fig], [{ ...tagged, heightM: 0 }], 'CHECK constraint failed'],
    [
      'a condition the app does not know',
      [fig],
      [{ ...tagged, condition: 'gone' as PlantCondition }],
      'CHECK constraint failed',
    ],
  ])('keeps the old copy when the new one has %s', async (_what, species, records, error) => {
    await store.replacePublicCopy([pitcher], [tagged], DOWNLOADED);
    await expect(store.replacePublicCopy(species, records, LATER)).rejects.toThrow(error);
    expect(await store.loadPublicCopy()).toEqual(oldCopy);
  });

  it('tries again when the database is busy', async () => {
    await store.replacePublicCopy([pitcher], [tagged], DOWNLOADED);
    const busy = new Error('Error code 5: database is locked');
    const run = jest.spyOn(SQLiteDatabase.prototype, 'runAsync').mockRejectedValueOnce(busy);
    try {
      await store.replacePublicCopy([fig, pitcher], [unmatched, tagged], LATER);
    } finally {
      run.mockRestore();
    }
    expect(await store.loadPublicCopy()).toEqual({
      species: [fig, pitcher],
      records: [unmatched, tagged],
      downloadedAt: LATER,
    });
  });

  // A phone that has synced counts as a staff phone when the app opens, so a download on a visitor
  // phone mustn't look like a sync.
  it('keeps its time apart from when the phone last synced and who uses it', async () => {
    await store.replacePublicCopy([pitcher], [tagged], DOWNLOADED);
    expect(await store.loadLastSynced()).toBeNull();
    expect(await store.loadMode()).toBeNull();

    await store.saveLastSynced(LATER);
    expect((await store.loadPublicCopy()).downloadedAt).toBe(DOWNLOADED);
  });

  it('leaves the staff records and the species list alone, and they leave it alone', async () => {
    const record: PlantRecord = {
      id: 'c2d4f6a8-1b3d-4f5a-8c7e-9a0b1c2d3e40',
      tagCode: 'NNP-C2D4F6',
      speciesName: 'Ficus sp.',
      condition: 'healthy',
      photoCount: 0,
      recordedAt: '2026-10-16T00:40:00.000Z',
      syncStatus: 'synced',
    };
    const option: SpeciesOption = {
      slug: 'ficus-benjamina',
      scientificName: 'Ficus benjamina',
      commonNames: [],
    };
    await store.saveRecord(record);
    await store.replaceSpecies([option]);

    await store.replacePublicCopy([pitcher], [tagged], DOWNLOADED);
    expect(await store.loadRecords()).toEqual([record]);
    expect(await store.loadSpecies()).toEqual([option]);

    await store.replaceSpecies([option]);
    expect(await store.loadPublicCopy()).toEqual(oldCopy);
  });

  it('still has the copy after it is closed and opened again', async () => {
    await store.replacePublicCopy([fig, pitcher], [unmatched, tagged], DOWNLOADED);
    await store.close();

    store = await openRecordsStore();
    expect(await store.loadPublicCopy()).toEqual({
      species: [fig, pitcher],
      records: [unmatched, tagged],
      downloadedAt: DOWNLOADED,
    });
  });
});

describe('species photos', () => {
  /** Notes the copy of a photo, the way the app does once the photo has come down. */
  function noteCopy(photo: NewPublicPhoto, file: string) {
    return store.savePublicPhotoFile(photo.speciesSlug, photo.url, file);
  }

  it('has no photos until the first download', async () => {
    expect(await store.loadPublicPhotos()).toEqual([]);
  });

  it('saves the photos in the order they came down, with no copy on the phone yet', async () => {
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [pitcherPhoto, figPhoto]);
    expect(await store.loadPublicPhotos()).toEqual([pitcherPhoto, figPhoto]);
  });

  it('notes the copy of a photo once it has come down, and only once', async () => {
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [pitcherPhoto, figPhoto]);
    expect(await noteCopy(pitcherPhoto, PITCHER_FILE)).toBe(true);
    expect(await noteCopy(pitcherPhoto, 'second-copy')).toBe(false);
    expect(await store.loadPublicPhotos()).toEqual([
      { ...pitcherPhoto, file: PITCHER_FILE },
      figPhoto,
    ]);
  });

  it("won't note a copy made from a photo that has changed since", async () => {
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [pitcherPhoto, figPhoto]);
    // New plant info came down while the old photo was still downloading.
    const newPhoto = { ...pitcherPhoto, url: 'https://images.example/pitcher-2.jpg' };
    await store.replacePublicCopy([fig, pitcher], [], LATER, [newPhoto, figPhoto]);

    expect(await noteCopy(pitcherPhoto, PITCHER_FILE)).toBe(false);
    expect(await store.loadPublicPhotos()).toEqual([newPhoto, figPhoto]);
  });

  it("won't note a copy for a species that has no photo with that link", async () => {
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [pitcherPhoto, figPhoto]);
    expect(await noteCopy({ ...pitcherPhoto, speciesSlug: fig.slug }, FIG_FILE)).toBe(false);
    expect(await store.loadPublicPhotos()).toEqual([pitcherPhoto, figPhoto]);
  });

  it('keeps the copy of a photo whose link is the same, and drops a changed one', async () => {
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [pitcherPhoto, figPhoto]);
    await noteCopy(pitcherPhoto, PITCHER_FILE);
    await noteCopy(figPhoto, FIG_FILE);

    const recaptioned = { ...pitcherPhoto, caption: 'A pitcher up close.', credit: 'Park guide' };
    const newFigPhoto = { ...figPhoto, url: 'https://images.example/fig-2.jpg' };
    await store.replacePublicCopy([fig, pitcher], [], LATER, [recaptioned, newFigPhoto]);
    expect(await store.loadPublicPhotos()).toEqual([
      { ...recaptioned, file: PITCHER_FILE },
      newFigPhoto,
    ]);

    // The new link has no copy yet, so the app can download it and note its copy.
    expect(await noteCopy(newFigPhoto, 'fig-copy-2')).toBe(true);
  });

  // With no new photo list, like when the photos couldn't be downloaded.
  it.each<[string, null | undefined]>([
    ['left out', undefined],
    ['null', null],
  ])('keeps the photos of species still there when the photos are %s', async (_what, photos) => {
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [pitcherPhoto, figPhoto]);
    await noteCopy(pitcherPhoto, PITCHER_FILE);

    // The photos stay in the order they came down in. Sorting by name would put the fig first.
    await store.replacePublicCopy([fig, pitcher], [tagged], LATER, photos);
    expect(await store.loadPublicPhotos()).toEqual([
      { ...pitcherPhoto, file: PITCHER_FILE },
      figPhoto,
    ]);

    await store.replacePublicCopy([pitcher], [tagged], LATER, photos);
    expect(await store.loadPublicPhotos()).toEqual([{ ...pitcherPhoto, file: PITCHER_FILE }]);
  });

  it('drops every photo when the server has none', async () => {
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [pitcherPhoto, figPhoto]);
    await noteCopy(pitcherPhoto, PITCHER_FILE);
    await store.replacePublicCopy([fig, pitcher], [], LATER, []);
    expect(await store.loadPublicPhotos()).toEqual([]);
  });

  it('saves only the first photo of each species, and only ones with a link', async () => {
    const secondPhoto = { ...pitcherPhoto, url: 'https://images.example/pitcher-2.jpg' };
    const noLink = { ...figPhoto, url: '' };
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [
      pitcherPhoto,
      secondPhoto,
      noLink,
    ]);
    expect(await store.loadPublicPhotos()).toEqual([pitcherPhoto]);
  });

  it('leaves out the photo of a species that is not in the plant info', async () => {
    await store.replacePublicCopy([pitcher], [], DOWNLOADED, [figPhoto, pitcherPhoto]);
    expect(await store.loadPublicPhotos()).toEqual([pitcherPhoto]);
  });

  it('keeps the photos as they were when the new plant info is turned down', async () => {
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [pitcherPhoto, figPhoto]);
    await noteCopy(pitcherPhoto, PITCHER_FILE);
    const saved = [{ ...pitcherPhoto, file: PITCHER_FILE }, figPhoto];

    await expect(store.replacePublicCopy([], [], LATER, [])).rejects.toThrow(EMPTY_PUBLIC_COPY);
    expect(await store.loadPublicPhotos()).toEqual(saved);

    const badFig = { ...fig, iucnCode: 'XX' as IucnCode };
    await expect(store.replacePublicCopy([pitcher, badFig], [], LATER, [])).rejects.toThrow(
      'CHECK constraint failed',
    );
    expect(await store.loadPublicPhotos()).toEqual(saved);

    const noTag = { ...tagged, tagCode: '' };
    await expect(store.replacePublicCopy([pitcher, fig], [noTag], LATER, [])).rejects.toThrow(
      'CHECK constraint failed',
    );
    expect(await store.loadPublicPhotos()).toEqual(saved);
  });

  it("won't note a copy with no file name", async () => {
    await store.replacePublicCopy([pitcher], [], DOWNLOADED, [pitcherPhoto]);
    await expect(noteCopy(pitcherPhoto, '')).rejects.toThrow('CHECK constraint failed');
    expect(await store.loadPublicPhotos()).toEqual([pitcherPhoto]);
  });

  it('still has the photos and their copies after it is closed and opened again', async () => {
    await store.replacePublicCopy([fig, pitcher], [], DOWNLOADED, [pitcherPhoto, figPhoto]);
    await noteCopy(pitcherPhoto, PITCHER_FILE);
    await store.close();

    store = await openRecordsStore();
    expect(await store.loadPublicPhotos()).toEqual([
      { ...pitcherPhoto, file: PITCHER_FILE },
      figPhoto,
    ]);
  });
});

describe('scan history', () => {
  it('has no scans until a tag is scanned', async () => {
    expect(await store.loadScans()).toEqual([]);
  });

  it('lists the latest scan first, and moves a tag scanned again to the top', async () => {
    await store.saveScan('NNP-3F9A1C', '2026-11-04T01:00:00.000Z');
    await store.saveScan('NNP-8D2E4F', '2026-11-04T02:00:00.000Z');
    await store.saveScan('NNP-3F9A1C', '2026-11-04T03:00:00.000Z');
    expect(await store.loadScans()).toEqual([
      { tagCode: 'NNP-3F9A1C', scannedAt: '2026-11-04T03:00:00.000Z' },
      { tagCode: 'NNP-8D2E4F', scannedAt: '2026-11-04T02:00:00.000Z' },
    ]);
  });

  it('puts the tag first scanned later first when two scans have the same time', async () => {
    await store.saveScan('NNP-3F9A1C', DOWNLOADED);
    await store.saveScan('NNP-8D2E4F', DOWNLOADED);
    expect((await store.loadScans()).map((scan) => scan.tagCode)).toEqual([
      'NNP-8D2E4F',
      'NNP-3F9A1C',
    ]);
  });

  it("won't save a scan with no tag", async () => {
    await expect(store.saveScan('', DOWNLOADED)).rejects.toThrow('CHECK constraint failed');
    expect(await store.loadScans()).toEqual([]);
  });

  it('forgets every scan when cleared, and keeps the plant info', async () => {
    await store.replacePublicCopy([pitcher], [tagged], DOWNLOADED);
    await store.saveScan('NNP-3F9A1C', DOWNLOADED);
    await store.saveScan('NNP-8D2E4F', LATER);

    await store.clearScans();
    expect(await store.loadScans()).toEqual([]);
    expect(await store.loadPublicCopy()).toEqual(oldCopy);
  });

  it('still has the scans after it is closed and opened again', async () => {
    await store.saveScan('NNP-3F9A1C', DOWNLOADED);
    await store.close();

    store = await openRecordsStore();
    expect(await store.loadScans()).toEqual([{ tagCode: 'NNP-3F9A1C', scannedAt: DOWNLOADED }]);
  });
});

import { keptPhotos, photoFiles } from '@/db/kept-photos';
import type { NewPublicPhoto, PublicPhoto } from '@/types/public-copy';

// Made-up main photos for two species, the same ones the store tests use.
const PITCHER = 'nepenthes-rafflesiana';
const FIG = 'ficus-benjamina';

const pitcherPhoto: NewPublicPhoto = {
  speciesSlug: PITCHER,
  url: 'https://images.example/pitcher.jpg',
  caption: 'A pitcher on its vine.',
  credit: 'Park staff',
};
const figPhoto: NewPublicPhoto = {
  speciesSlug: FIG,
  url: 'https://images.example/fig.jpg',
  caption: '',
  credit: '',
};

// The same photos once their copies have come down to the phone.
const savedPitcher: PublicPhoto = { ...pitcherPhoto, file: 'pitcher-copy' };
const savedFig: PublicPhoto = { ...figPhoto, file: 'fig-copy' };

const BOTH = new Set([PITCHER, FIG]);
const ONLY_PITCHER = new Set([PITCHER]);

describe('keptPhotos', () => {
  it('keeps the copy of a photo whose link is the same', () => {
    expect(keptPhotos([pitcherPhoto], [savedPitcher], BOTH)).toEqual([savedPitcher]);
  });

  it('drops the copy of a photo whose link has changed', () => {
    const newPhoto = { ...pitcherPhoto, url: 'https://images.example/pitcher-2.jpg' };
    const [kept] = keptPhotos([newPhoto], [savedPitcher], BOTH);
    expect(kept).toEqual(newPhoto);
    expect(kept.file).toBeUndefined();
  });

  it('takes the caption and credit from the new photo', () => {
    const recaptioned = { ...pitcherPhoto, caption: 'A new caption.', credit: 'A new credit' };
    expect(keptPhotos([recaptioned], [savedPitcher], BOTH)).toEqual([
      { ...recaptioned, file: 'pitcher-copy' },
    ]);
  });

  // With no new list, like when the photos couldn't be downloaded.
  it.each<[string, null | undefined]>([
    ['left out', undefined],
    ['null', null],
  ])('keeps the saved photos of species still there when the new list is %s', (_what, next) => {
    const saved = [savedPitcher, savedFig];
    expect(keptPhotos(next, saved, ONLY_PITCHER)).toEqual([savedPitcher]);
    expect(keptPhotos(next, saved, BOTH)).toEqual([savedPitcher, savedFig]);
  });

  it('drops every photo when the new list is empty', () => {
    expect(keptPhotos([], [savedPitcher, savedFig], BOTH)).toEqual([]);
  });

  it('only counts the first photo of each species', () => {
    const second = { ...pitcherPhoto, url: 'https://images.example/pitcher-2.jpg' };
    expect(keptPhotos([pitcherPhoto, second], [], BOTH)).toEqual([pitcherPhoto]);
  });

  it('skips a photo with no link and uses the next photo of that species', () => {
    const noLink = { ...pitcherPhoto, url: '', caption: 'No link' };
    expect(keptPhotos([noLink, pitcherPhoto], [], BOTH)).toEqual([pitcherPhoto]);
  });

  it('leaves out the photo of a species that is not in the plant info', () => {
    expect(keptPhotos([figPhoto, pitcherPhoto], [], ONLY_PITCHER)).toEqual([pitcherPhoto]);
  });

  it('keeps the order of the new list', () => {
    expect(keptPhotos([figPhoto, pitcherPhoto], [savedPitcher, savedFig], BOTH)).toEqual([
      savedFig,
      savedPitcher,
    ]);
  });

  it('never gives a photo a copy it did not have', () => {
    const [kept] = keptPhotos([pitcherPhoto], [{ ...pitcherPhoto }], BOTH);
    expect(kept.file).toBeUndefined();
  });

  it("never takes another species' copy, even when the link is the same", () => {
    const sameLink = { ...figPhoto, url: pitcherPhoto.url };
    const [kept] = keptPhotos([sameLink], [savedPitcher], BOTH);
    expect(kept).toEqual(sameLink);
    expect(kept.file).toBeUndefined();
  });

  it('hands back new photos, so changing one leaves the lists it came from alone', () => {
    const next = [{ ...pitcherPhoto }];
    const saved = [{ ...savedPitcher }];
    for (const kept of [...keptPhotos(next, saved, BOTH), ...keptPhotos(null, saved, BOTH)]) {
      kept.caption = 'Changed after';
    }
    expect(next).toEqual([pitcherPhoto]);
    expect(saved).toEqual([savedPitcher]);
  });
});

describe('photoFiles', () => {
  it('lists the names of the copies on the phone, in order', () => {
    expect(photoFiles([savedFig, savedPitcher])).toEqual(['fig-copy', 'pitcher-copy']);
  });

  it('skips photos that have no copy yet', () => {
    expect(photoFiles([pitcherPhoto, savedFig])).toEqual(['fig-copy']);
  });

  it('gives an empty list when there are no photos', () => {
    expect(photoFiles([])).toEqual([]);
  });
});

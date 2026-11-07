import { downloadMissingPhotos } from '@/sync/public-photos';
import type { PublicPhoto } from '@/types/public-copy';

// What one round of photo downloads does, with stand-ins for the phone's files and database. When
// the rounds run is in src/state/__tests__/public-copy-context.test.tsx.

const STORAGE = 'https://storage.example/botanical-photos/species';

const PITCHER: PublicPhoto = {
  speciesSlug: 'nepenthes-rafflesiana',
  url: `${STORAGE}/nepenthes-rafflesiana/5d0c8e2a-7b1f-4c3d-9e6a-2f4b8c1d3e5a.jpg`,
  caption: 'A pitcher on its vine.',
  credit: 'Niah field team',
};

const FIG: PublicPhoto = {
  speciesSlug: 'ficus-benjamina',
  url: 'https://images.example/fig.jpg',
  caption: 'Figs on a branch.',
  credit: 'A made-up photographer',
};

const BELIAN: PublicPhoto = {
  speciesSlug: 'eusideroxylon-zwageri',
  url: 'https://images.example/belian.jpg',
  caption: 'Belian bark.',
  credit: 'A made-up photographer',
};

/** A photo that came down in an earlier round. */
const ENGKABANG: PublicPhoto = {
  speciesSlug: 'shorea-macrophylla',
  url: 'https://images.example/engkabang.jpg',
  caption: '',
  credit: '',
  file: 'engkabang.jpg',
};

/** The file each photo downloads to. */
const FILES = new Map([
  [PITCHER.url, 'pitcher.jpg'],
  [FIG.url, 'fig.jpg'],
  [BELIAN.url, 'belian.jpg'],
  [ENGKABANG.url, 'engkabang-again.jpg'],
]);

/**
 * Stand-ins for everything a round needs. The database gives `start` when the round starts and
 * `end` when it reads the photos again at the end, and every download works.
 */
function stepsFor(start: PublicPhoto[], end = start) {
  return {
    online: jest.fn<Promise<boolean>, []>(async () => true),
    loadPhotos: jest
      .fn<Promise<PublicPhoto[]>, []>()
      .mockResolvedValueOnce(start)
      .mockResolvedValueOnce(end),
    download: jest.fn<Promise<string | null>, [url: string]>(
      async (url) => FILES.get(url) ?? null,
    ),
    saveFile: jest.fn<Promise<boolean>, [speciesSlug: string, url: string, file: string]>(
      async () => true,
    ),
    deleteFile: jest.fn<void, [file: string]>(),
    removeStray: jest.fn<void, [keep: string[]]>(),
  };
}

/** Lets every promise that's ready finish. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('downloadMissingPhotos', () => {
  it('downloads the photos with no file yet, and notes the file each one went in', async () => {
    const steps = stepsFor([PITCHER, ENGKABANG, FIG]);
    await downloadMissingPhotos(steps);
    expect(steps.download.mock.calls).toEqual([[PITCHER.url], [FIG.url]]);
    expect(steps.saveFile.mock.calls).toEqual([
      ['nepenthes-rafflesiana', PITCHER.url, 'pitcher.jpg'],
      ['ficus-benjamina', FIG.url, 'fig.jpg'],
    ]);
    expect(steps.deleteFile).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('waits for each photo to come down before starting the next', async () => {
    let finish = () => {};
    const steps = stepsFor([PITCHER, FIG]);
    steps.download.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve('pitcher.jpg');
        }),
    );
    const round = downloadMissingPhotos(steps);
    await flush();
    expect(steps.download).toHaveBeenCalledTimes(1);
    expect(steps.saveFile).not.toHaveBeenCalled();

    finish();
    await round;
    expect(steps.download).toHaveBeenCalledTimes(2);
  });

  it('stops when the signal goes, and still clears out the files nothing uses', async () => {
    const steps = stepsFor([PITCHER, FIG, BELIAN, ENGKABANG]);
    // The signal goes before the fig, and the belian after it is never tried.
    steps.online.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await downloadMissingPhotos(steps);
    expect(steps.online).toHaveBeenCalledTimes(2);
    expect(steps.download.mock.calls).toEqual([[PITCHER.url]]);
    expect(steps.removeStray.mock.calls).toEqual([[['engkabang.jpg']]]);
  });

  it("doesn't download anything with no signal", async () => {
    const steps = stepsFor([PITCHER, ENGKABANG]);
    steps.online.mockResolvedValue(false);
    await downloadMissingPhotos(steps);
    expect(steps.download).not.toHaveBeenCalled();
    expect(steps.removeStray.mock.calls).toEqual([[['engkabang.jpg']]]);
  });

  it("doesn't check for signal when every photo is already on the phone", async () => {
    const steps = stepsFor([ENGKABANG]);
    await downloadMissingPhotos(steps);
    expect(steps.online).not.toHaveBeenCalled();
    expect(steps.download).not.toHaveBeenCalled();
    expect(steps.removeStray.mock.calls).toEqual([[['engkabang.jpg']]]);
  });

  it('skips a photo that fails to download and goes on to the next', async () => {
    const steps = stepsFor([PITCHER, FIG]);
    steps.download.mockResolvedValueOnce(null);
    await downloadMissingPhotos(steps);
    expect(steps.download).toHaveBeenCalledTimes(2);
    expect(steps.saveFile.mock.calls).toEqual([['ficus-benjamina', FIG.url, 'fig.jpg']]);
    expect(steps.deleteFile).not.toHaveBeenCalled();
  });

  // The plant info can update while a photo comes down, and the new info may have another photo.
  it('deletes the new file when the photo changed while it came down', async () => {
    const steps = stepsFor([PITCHER, FIG]);
    steps.saveFile.mockResolvedValueOnce(false);
    await downloadMissingPhotos(steps);
    expect(steps.deleteFile.mock.calls).toEqual([['pitcher.jpg']]);
    expect(steps.saveFile).toHaveBeenCalledTimes(2);
  });

  it("warns and deletes the new file when it can't note where the photo went", async () => {
    const error = new Error('Something went wrong.');
    const steps = stepsFor([PITCHER, FIG]);
    steps.saveFile.mockRejectedValueOnce(error);
    await downloadMissingPhotos(steps);
    expect(console.warn).toHaveBeenCalledWith("Couldn't save a species photo.", error);
    expect(steps.deleteFile.mock.calls).toEqual([['pitcher.jpg']]);
    // It still goes on to the next photo.
    expect(steps.saveFile).toHaveBeenCalledTimes(2);
  });

  it('goes by the photos saved at the end when it clears out the old files', async () => {
    // The plant info updated during the round. The fig photo changed and the engkabang left.
    const fig = { ...FIG, url: 'https://images.example/fig-2.jpg' };
    const steps = stepsFor([PITCHER, FIG, ENGKABANG], [{ ...PITCHER, file: 'pitcher.jpg' }, fig]);
    steps.saveFile.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await downloadMissingPhotos(steps);
    expect(steps.deleteFile.mock.calls).toEqual([['fig.jpg']]);
    expect(steps.removeStray.mock.calls).toEqual([[['pitcher.jpg']]]);
  });

  it("throws when the saved photos can't be read, before downloading anything", async () => {
    const error = new Error('Something went wrong.');
    const steps = stepsFor([]);
    steps.loadPhotos.mockReset().mockRejectedValue(error);
    await expect(downloadMissingPhotos(steps)).rejects.toBe(error);
    expect(steps.download).not.toHaveBeenCalled();
    expect(steps.removeStray).not.toHaveBeenCalled();
  });

  // Clearing out with nothing to keep would delete every photo on the phone.
  it("leaves the files alone when the saved photos can't be read at the end", async () => {
    const error = new Error('Something went wrong.');
    const steps = stepsFor([]);
    steps.loadPhotos.mockReset().mockResolvedValueOnce([PITCHER]).mockRejectedValueOnce(error);
    await expect(downloadMissingPhotos(steps)).rejects.toBe(error);
    expect(steps.saveFile).toHaveBeenCalledTimes(1);
    expect(steps.removeStray).not.toHaveBeenCalled();
  });

  it('throws when checking for signal fails, and leaves the files alone', async () => {
    const error = new Error('Something went wrong.');
    const steps = stepsFor([PITCHER]);
    steps.online.mockRejectedValueOnce(error);
    await expect(downloadMissingPhotos(steps)).rejects.toBe(error);
    expect(steps.download).not.toHaveBeenCalled();
    expect(steps.removeStray).not.toHaveBeenCalled();
  });
});

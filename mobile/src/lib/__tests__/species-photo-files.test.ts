import { Directory, File, Paths } from 'expo-file-system';
import type { DownloadProgress } from 'expo-file-system';

import {
  deleteSpeciesPhoto,
  downloadSpeciesPhoto,
  removeStraySpeciesPhotos,
  speciesPhotoUri,
} from '@/lib/species-photo-files';

// The same limit as the app, so the tests can go just under and just over it.
const MAX_BYTES = 5 * 1024 * 1024;

// What the made-up download throws when the app stops it.
const STOPPED = new Error('The download was stopped.');

let warn: jest.SpyInstance;
// The signal the app gave the last download, to see whether it stopped the download.
let lastSignal: AbortSignal | undefined;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  lastSignal = undefined;
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  // The stand-in keeps its files until the whole test file is done, so clear them out each time.
  photoFolder().delete();
  new Directory(Paths.document, 'record-photos').delete();
});

function photoFolder() {
  return new Directory(Paths.document, 'species-photos');
}

function savePhoto(name: string, folder = photoFolder()) {
  folder.create();
  new File(folder, name).write(new Uint8Array([1, 2, 3]));
}

function photoNames() {
  return photoFolder()
    .list()
    .map((entry) => entry.name)
    .sort();
}

// How big a saved photo is, or 0 when there's no file for it.
function photoSize(name: string | null) {
  return name ? new File(speciesPhotoUri(name)).size : 0;
}

type Download = {
  // What the download says as the photo comes down, in order.
  progress?: DownloadProgress[];
  // How big the photo is once all of it has come down.
  bytes: number;
  // Stops the download with this error after the progress, like when the signal goes.
  error?: Error;
};

// No test goes online, so this stands in for the download. Like the real one, it writes the photo
// into the file the app gave it, says how it's going, and stops when the app tells it to.
function fakeDownload({ progress = [], bytes, error }: Download) {
  return jest
    .spyOn(File, 'downloadFileAsync')
    .mockImplementation(async (_url, destination, options) => {
      if (!(destination instanceof File)) {
        throw new Error('The photo should go in a file.');
      }
      lastSignal = options?.signal;
      for (const report of progress) {
        destination.write(new Uint8Array(report.bytesWritten));
        options?.onProgress?.(report);
        if (options?.signal?.aborted) {
          throw STOPPED;
        }
      }
      if (error) {
        throw error;
      }
      destination.write(new Uint8Array(bytes));
      return destination;
    });
}

describe('speciesPhotoUri', () => {
  it('gives where a saved photo is, in the species photo folder', () => {
    expect(speciesPhotoUri('pitcher-copy')).toBe(
      `${Paths.document.uri}/species-photos/pitcher-copy`,
    );
  });
});

describe('downloadSpeciesPhoto', () => {
  it('downloads a photo into its own file in the species photo folder', async () => {
    const download = fakeDownload({
      progress: [
        { bytesWritten: 400, totalBytes: 1000 },
        { bytesWritten: 1000, totalBytes: 1000 },
      ],
      bytes: 1000,
    });
    const url = 'https://images.example/pitcher.jpg';
    const name = await downloadSpeciesPhoto(url);

    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(
      url,
      expect.any(File),
      expect.objectContaining({ signal: expect.anything(), onProgress: expect.any(Function) }),
    );
    expect(photoNames()).toEqual([name]);
    expect(photoSize(name)).toBe(1000);
    // Only the name goes in the database, since the full path can change when the app updates.
    expect(name).not.toContain('/');
    expect(photoFolder().exists).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('gives each download its own file, even for the same link', async () => {
    const create = jest.spyOn(Directory.prototype, 'create');
    fakeDownload({ bytes: 100 });
    const url = 'https://images.example/fig.jpg';
    const first = await downloadSpeciesPhoto(url);
    const second = await downloadSpeciesPhoto(url);

    expect(first).not.toBe(second);
    expect(photoNames()).toEqual([first, second].sort());
    // The real folder can only be made again when it's told that's fine.
    expect(create).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
  });

  it("stops a photo the server says is over 5 MB, and doesn't try it again", async () => {
    const download = fakeDownload({
      progress: [{ bytesWritten: 1000, totalBytes: MAX_BYTES + 1 }],
      bytes: MAX_BYTES + 1,
    });
    const url = 'https://images.example/huge.jpg';

    expect(await downloadSpeciesPhoto(url)).toBeNull();
    expect(lastSignal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalledWith("Couldn't download a species photo.", STOPPED);
    expect(photoNames()).toEqual([]);

    expect(await downloadSpeciesPhoto(url)).toBeNull();
    expect(download).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    // Other links still come down.
    fakeDownload({ bytes: 100 });
    expect(photoSize(await downloadSpeciesPhoto('https://images.example/small.jpg'))).toBe(100);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('stops a photo once it passes 5 MB when the server never said its size', async () => {
    // The real download says -1 for the size when the server doesn't send it.
    const download = fakeDownload({
      progress: [
        { bytesWritten: MAX_BYTES, totalBytes: -1 },
        { bytesWritten: MAX_BYTES + 1, totalBytes: -1 },
      ],
      bytes: MAX_BYTES + 1,
    });
    const url = 'https://images.example/no-size.jpg';

    expect(await downloadSpeciesPhoto(url)).toBeNull();
    expect(lastSignal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalledWith("Couldn't download a species photo.", STOPPED);
    expect(photoNames()).toEqual([]);

    expect(await downloadSpeciesPhoto(url)).toBeNull();
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('keeps a photo of exactly 5 MB', async () => {
    fakeDownload({
      progress: [
        { bytesWritten: MAX_BYTES / 2, totalBytes: MAX_BYTES },
        { bytesWritten: MAX_BYTES, totalBytes: MAX_BYTES },
      ],
      bytes: MAX_BYTES,
    });
    const name = await downloadSpeciesPhoto('https://images.example/five-mb.jpg');

    expect(lastSignal?.aborted).toBe(false);
    expect(photoSize(name)).toBe(MAX_BYTES);
    expect(warn).not.toHaveBeenCalled();
  });

  it("deletes a photo that turns out to be over 5 MB once it's down", async () => {
    const download = fakeDownload({ bytes: MAX_BYTES + 1 });
    const url = 'https://images.example/big-file.jpg';

    expect(await downloadSpeciesPhoto(url)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "Couldn't download a species photo.",
      new Error('The photo is too big to save.'),
    );
    expect(photoNames()).toEqual([]);

    expect(await downloadSpeciesPhoto(url)).toBeNull();
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('deletes a photo that came down empty, and tries it again next time', async () => {
    const download = fakeDownload({
      // The server said how big the photo was, but none of it came down.
      progress: [{ bytesWritten: 0, totalBytes: 1000 }],
      bytes: 0,
    });
    const url = 'https://images.example/empty.jpg';

    expect(await downloadSpeciesPhoto(url)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "Couldn't download a species photo.",
      new Error('The photo came down empty.'),
    );
    expect(photoNames()).toEqual([]);

    fakeDownload({ bytes: 100 });
    expect(photoSize(await downloadSpeciesPhoto(url))).toBe(100);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('deletes the part of a photo that came down before the signal went', async () => {
    const error = new Error('The signal went.');
    const download = fakeDownload({
      // A photo of exactly 5 MB is fine, so losing the signal partway through one doesn't count
      // it as too big.
      progress: [{ bytesWritten: 500, totalBytes: MAX_BYTES }],
      bytes: MAX_BYTES,
      error,
    });
    const url = 'https://images.example/cut-off.jpg';

    expect(await downloadSpeciesPhoto(url)).toBeNull();
    expect(warn).toHaveBeenCalledWith("Couldn't download a species photo.", error);
    expect(photoNames()).toEqual([]);

    // It's tried again next time.
    fakeDownload({ bytes: MAX_BYTES });
    expect(photoSize(await downloadSpeciesPhoto(url))).toBe(MAX_BYTES);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('stops a photo that takes over a minute, and tries it again next time', async () => {
    jest.useFakeTimers();
    const download = jest
      .spyOn(File, 'downloadFileAsync')
      .mockImplementation((_url, destination, options) => {
        lastSignal = options?.signal;
        // Part of the photo comes down, then nothing more until the app stops the download.
        if (destination instanceof File) {
          destination.write(new Uint8Array(500));
        }
        return new Promise<File>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(STOPPED));
        });
      });
    const url = 'https://images.example/slow.jpg';
    const result = downloadSpeciesPhoto(url);

    jest.advanceTimersByTime(59_999);
    expect(lastSignal?.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(lastSignal?.aborted).toBe(true);
    expect(await result).toBeNull();
    expect(warn).toHaveBeenCalledWith("Couldn't download a species photo.", STOPPED);
    expect(photoNames()).toEqual([]);

    fakeDownload({ bytes: 100 });
    expect(photoSize(await downloadSpeciesPhoto(url))).toBe(100);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("clears its timer once it's done, whether the photo came down or not", async () => {
    jest.useFakeTimers();
    fakeDownload({ bytes: 100 });
    expect(photoSize(await downloadSpeciesPhoto('https://images.example/quick.jpg'))).toBe(100);
    expect(jest.getTimerCount()).toBe(0);

    fakeDownload({ bytes: 0 });
    expect(await downloadSpeciesPhoto('https://images.example/quick-empty.jpg')).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('deleteSpeciesPhoto', () => {
  it('deletes the saved photo with that name and leaves the others', () => {
    savePhoto('pitcher-copy');
    savePhoto('fig-copy');
    deleteSpeciesPhoto('pitcher-copy');

    expect(photoNames()).toEqual(['fig-copy']);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does nothing when there's no saved photo with that name", () => {
    savePhoto('fig-copy');
    deleteSpeciesPhoto('pitcher-copy');

    expect(photoNames()).toEqual(['fig-copy']);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when the photo can't be deleted", () => {
    savePhoto('pitcher-copy');
    const error = new Error('The disk is busy.');
    jest.spyOn(File.prototype, 'delete').mockImplementation(() => {
      throw error;
    });

    expect(() => deleteSpeciesPhoto('pitcher-copy')).not.toThrow();
    expect(warn).toHaveBeenCalledWith("Couldn't delete a species photo.", error);
  });
});

describe('removeStraySpeciesPhotos', () => {
  it("deletes the photos it isn't told to keep", () => {
    savePhoto('pitcher-copy');
    savePhoto('old-pitcher-copy');
    savePhoto('half-done');
    removeStraySpeciesPhotos(['pitcher-copy', 'fig-copy']);

    expect(photoNames()).toEqual(['pitcher-copy']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves the record photos alone', () => {
    savePhoto('record-copy', new Directory(Paths.document, 'record-photos'));
    savePhoto('old-pitcher-copy');
    removeStraySpeciesPhotos([]);

    expect(photoNames()).toEqual([]);
    expect(new File(Paths.document, 'record-photos', 'record-copy').exists).toBe(true);
  });

  it('leaves any folder inside the photo folder alone', () => {
    savePhoto('old-pitcher-copy');
    const inner = new Directory(photoFolder(), 'inner');
    new File(inner, 'pitcher-copy').write(new Uint8Array([1, 2, 3]));
    // The stand-in only lists files, but the real list() gives the folders in it too.
    jest
      .spyOn(Directory.prototype, 'list')
      .mockReturnValue([new File(photoFolder(), 'old-pitcher-copy'), inner]);
    removeStraySpeciesPhotos([]);

    expect(new File(photoFolder(), 'old-pitcher-copy').exists).toBe(false);
    expect(new File(inner, 'pitcher-copy').exists).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("doesn't look for photos when the folder isn't there yet", () => {
    const list = jest.spyOn(Directory.prototype, 'list');
    removeStraySpeciesPhotos(['pitcher-copy']);

    // The real list() throws for a folder that isn't there, which would warn for nothing.
    expect(list).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when an old photo can't be deleted", () => {
    savePhoto('old-pitcher-copy');
    const error = new Error('The disk is busy.');
    jest.spyOn(File.prototype, 'delete').mockImplementation(() => {
      throw error;
    });

    expect(() => removeStraySpeciesPhotos([])).not.toThrow();
    expect(warn).toHaveBeenCalledWith("Couldn't clear out old species photos.", error);
  });
});

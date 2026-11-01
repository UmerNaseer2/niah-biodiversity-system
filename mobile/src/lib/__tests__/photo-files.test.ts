import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import {
  deletePhotoFile,
  photoUri,
  readPhotoBytes,
  removeStrayPhotos,
  savePhoto,
} from '@/lib/photo-files';

const manipulate = jest.mocked(ImageManipulator.manipulate);

/** The photo the camera or library left in the cache, as a file. */
function pickedPhoto(width: number, height: number, name = 'from-the-picker.jpg') {
  new Directory(Paths.cache, 'ImagePicker').create({ idempotent: true, intermediates: true });
  const file = new File(Paths.cache, 'ImagePicker', name);
  file.write(new Uint8Array([1, 2, 3]));
  return { uri: file.uri, width, height, file };
}

const folder = () => new Directory(Paths.document, 'record-photos');

beforeEach(() => {
  jest.clearAllMocks();
  for (const directory of [folder(), new Directory(Paths.cache, 'ImagePicker')]) {
    if (directory.exists) {
      directory.delete();
    }
  }
});

describe('savePhoto', () => {
  it('saves a new JPEG in the document folder and gives back a relative path', async () => {
    const path = await savePhoto(pickedPhoto(1000, 800));
    expect(path).toMatch(/^record-photos\/[0-9a-f-]{36}\.jpg$/);
    expect(new File(Paths.document, path).exists).toBe(true);
    expect(new Uint8Array((await readPhotoBytes(path))!)).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    );
  });

  it('writes it out again even when it is small, which is what leaves out the EXIF block', async () => {
    const picked = pickedPhoto(600, 400);
    await savePhoto(picked);
    const context = manipulate.mock.results[0].value;
    expect(manipulate).toHaveBeenCalledWith(picked.uri);
    expect(context.resize).not.toHaveBeenCalled();
    const image = await context.renderAsync.mock.results[0].value;
    expect(image.saveAsync).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.7 });
  });

  it.each([
    ['wide', 4000, 3000, { width: 2048 }],
    ['tall', 3000, 4000, { height: 2048 }],
    ['square', 4000, 4000, { width: 2048 }],
  ])('shrinks a %s photo by its longest side', async (_, width, height, wanted) => {
    await savePhoto(pickedPhoto(width, height));
    expect(manipulate.mock.results[0].value.resize).toHaveBeenCalledWith(wanted);
  });

  it('leaves a photo that is exactly the limit the size it is', async () => {
    await savePhoto(pickedPhoto(2048, 1000));
    expect(manipulate.mock.results[0].value.resize).not.toHaveBeenCalled();
  });

  it('removes the copy the picker left in the cache', async () => {
    const picked = pickedPhoto(600, 400);
    await savePhoto(picked);
    expect(picked.file.exists).toBe(false);
  });

  it("removes the picker's copy when its folder isn't under the cache folder, as in Expo Go", async () => {
    new Directory(Paths.document, 'ImagePicker').create({ idempotent: true, intermediates: true });
    const copy = new File(Paths.document, 'ImagePicker', 'outside.jpg');
    copy.write(new Uint8Array([1, 2, 3]));
    await savePhoto({ uri: copy.uri, width: 100, height: 100 });
    expect(copy.exists).toBe(false);
  });

  it('removes the copy in the cache and lets go of the image even when saving fails', async () => {
    const picked = pickedPhoto(600, 400);
    const context = manipulate.getMockImplementation()!(picked.uri);
    context.renderAsync = jest.fn().mockRejectedValue(new Error('no memory'));
    context.release = jest.fn();
    manipulate.mockReturnValueOnce(context);

    await expect(savePhoto(picked)).rejects.toThrow('no memory');

    expect(context.release).toHaveBeenCalledTimes(1);
    expect(picked.file.exists).toBe(false);
    expect(folder().exists).toBe(false);
  });

  it("doesn't touch a file that isn't in the cache", async () => {
    folder().create({ idempotent: true });
    const elsewhere = new File(Paths.document, 'record-photos', 'not-from-the-cache.jpg');
    elsewhere.write(new Uint8Array([1]));
    await savePhoto({ uri: elsewhere.uri, width: 600, height: 400 });
    expect(elsewhere.exists).toBe(true);
  });
});

describe('the other file jobs', () => {
  it('builds the full address from the path each time', () => {
    expect(photoUri('record-photos/a.jpg')).toBe(
      new File(Paths.document, 'record-photos/a.jpg').uri,
    );
  });

  it('gives null for the bytes of a file that has gone', async () => {
    expect(await readPhotoBytes('record-photos/gone.jpg')).toBeNull();
  });

  it('deletes a photo, and a file that has gone already is fine', async () => {
    const path = await savePhoto(pickedPhoto(600, 400));
    deletePhotoFile(path);
    expect(new File(Paths.document, path).exists).toBe(false);
    expect(() => deletePhotoFile(path)).not.toThrow();
  });
});

describe('removeStrayPhotos', () => {
  it('deletes the files no record owns and keeps the rest', async () => {
    const kept = await savePhoto(pickedPhoto(600, 400, 'one.jpg'));
    const stray = await savePhoto(pickedPhoto(600, 400, 'two.jpg'));
    removeStrayPhotos([kept]);
    expect(new File(Paths.document, kept).exists).toBe(true);
    expect(new File(Paths.document, stray).exists).toBe(false);
  });

  it('does nothing before the first photo', () => {
    expect(() => removeStrayPhotos([])).not.toThrow();
  });
});

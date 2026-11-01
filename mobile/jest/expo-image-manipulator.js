// Jest can't run the real expo-image-manipulator, because it needs the phone to read the pixels.
// This stands in for it by writing a made up JPEG to the cache folder like the real one does, and
// keeps what it was asked for so a test can check it. Whether the real one leaves out the EXIF
// block can only be shown on a phone or simulator, from the bytes of the saved file.
/* global jest */
const { File, Paths } = require('./expo-file-system');

const SaveFormat = { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' };

let renders = 0;

const ImageManipulator = {
  manipulate: jest.fn(() => {
    const context = {
      resize: jest.fn(() => context),
      renderAsync: jest.fn(async () => ({
        saveAsync: jest.fn(async () => {
          renders += 1;
          const file = new File(Paths.cache, 'ImageManipulator', `render-${renders}.jpg`);
          file.write(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
          return { uri: file.uri, width: 1, height: 1 };
        }),
        release: jest.fn(),
      })),
      release: jest.fn(),
    };
    return context;
  }),
};

module.exports = { __esModule: true, ImageManipulator, SaveFormat };

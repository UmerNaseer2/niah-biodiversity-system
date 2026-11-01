import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { announce } from '@/lib/announce';
import { plural } from '@/lib/format';
import { deletePhotoFile, savePhoto, type PickedPhoto } from '@/lib/photo-files';

/**
 * The proposal sets no number. Five is enough to show the plant, its leaves and its bark, and each
 * one has to go up over whatever signal there is near the park.
 */
export const MAX_PHOTOS = 5;

const CAMERA_FAILED = "The camera wouldn't open. Try again, or choose a photo from the library.";
const LIBRARY_FAILED = "The photo library wouldn't open. Please try again.";
const CAMERA_NEEDED = 'The app needs camera access to photograph the plant.';
const CAMERA_OFF = 'Camera access is off for this app. Turn it on in Settings, then try again.';

// quality 1 because savePhoto compresses them, and doing it twice would only make them worse.
const CAMERA_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };

export type PhotoCapture = {
  /** The photos on the form, relative to the document folder. */
  paths: string[];
  /** True while the camera or library is open, or a photo is being saved. */
  busy: boolean;
  /** What went wrong and what to do about it. */
  problem?: string;
  /** True when only the Settings app can give the camera permission back. */
  needsSettings: boolean;
  takePhoto: () => Promise<void>;
  choosePhotos: () => Promise<void>;
  /** Takes a photo off the form and deletes its file. */
  remove: (path: string) => void;
  /** Empties the form for the next record. The files stay, because the saved record owns them. */
  clear: () => void;
};

/** Everything the Photos card on the New Record form does. */
export function usePhotoCapture(): PhotoCapture {
  const [paths, setPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [needsSettings, setNeedsSettings] = useState(false);
  // State only changes on the next render, which is too late to stop a second tap.
  const working = useRef(false);

  function fail(message: string, settings = false) {
    setProblem(message);
    setNeedsSettings(settings);
    announce(message);
  }

  /** Saves what came back from the camera or library, keeping whichever ones work. */
  async function addPhotos(picked: PickedPhoto[]) {
    const saved: string[] = [];
    for (const photo of picked) {
      try {
        saved.push(await savePhoto(photo));
      } catch (error) {
        console.warn("Couldn't save a photo.", error);
      }
    }
    setPaths((current) => [...current, ...saved]);
    const failed = picked.length - saved.length;
    if (failed > 0) {
      fail(
        `Couldn't save ${failed === 1 ? 'that photo' : plural(failed, 'photo')}. ` +
          'The phone might be out of space. Please try again.',
      );
    } else if (saved.length > 0) {
      announce(`${plural(saved.length, 'photo')} added.`);
    }
  }

  /** Runs one press of a button, unless another one is still going. */
  async function once(task: () => Promise<void>) {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setProblem(undefined);
    setNeedsSettings(false);
    try {
      await task();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function takePhoto() {
    return once(async () => {
      let picked: ImagePicker.ImagePickerResult;
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          fail(permission.canAskAgain ? CAMERA_NEEDED : CAMERA_OFF, !permission.canAskAgain);
          return;
        }
        picked = await ImagePicker.launchCameraAsync(CAMERA_OPTIONS);
      } catch (error) {
        console.warn("Couldn't open the camera.", error);
        fail(CAMERA_FAILED);
        return;
      }
      if (!picked.canceled) {
        await addPhotos(picked.assets.slice(0, MAX_PHOTOS - paths.length));
      }
    });
  }

  function choosePhotos() {
    const spaceLeft = MAX_PHOTOS - paths.length;
    return once(async () => {
      let picked: ImagePicker.ImagePickerResult;
      try {
        picked = await ImagePicker.launchImageLibraryAsync({
          ...CAMERA_OPTIONS,
          allowsMultipleSelection: true,
          selectionLimit: spaceLeft,
        });
      } catch (error) {
        console.warn("Couldn't open the photo library.", error);
        fail(LIBRARY_FAILED);
        return;
      }
      if (!picked.canceled) {
        await addPhotos(picked.assets.slice(0, spaceLeft));
      }
    });
  }

  function remove(path: string) {
    deletePhotoFile(path);
    setPaths((current) => current.filter((other) => other !== path));
    announce('Photo removed.');
  }

  function clear() {
    setPaths([]);
    setProblem(undefined);
    setNeedsSettings(false);
  }

  // Android can close the app to free up memory while the camera is open. The photo isn't lost, but
  // it can only be asked for once the app has started again.
  const addPending = useRef(addPhotos);
  useEffect(() => {
    addPending.current = addPhotos;
  });
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    ImagePicker.getPendingResultAsync()
      .then((result) => {
        if (result && 'canceled' in result && !result.canceled) {
          return addPending.current(result.assets.slice(0, MAX_PHOTOS));
        }
      })
      .catch((error) => console.warn("Couldn't get the photo back from the camera.", error));
  }, []);

  return { paths, busy, problem, needsSettings, takePhoto, choosePhotos, remove, clear };
}

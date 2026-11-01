import * as ImagePicker from 'expo-image-picker';
import { act, renderHook, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform } from 'react-native';

import { MAX_PHOTOS, usePhotoCapture } from '@/hooks/use-photo-capture';
import { deletePhotoFile, savePhoto } from '@/lib/photo-files';

jest.mock('expo-image-picker');
jest.mock('@/lib/photo-files');

const requestCamera = jest.mocked(ImagePicker.requestCameraPermissionsAsync);
const launchCamera = jest.mocked(ImagePicker.launchCameraAsync);
const launchLibrary = jest.mocked(ImagePicker.launchImageLibraryAsync);
const getPending = jest.mocked(ImagePicker.getPendingResultAsync);
const save = jest.mocked(savePhoto);
const deleteFile = jest.mocked(deletePhotoFile);

function permission(granted: boolean, canAskAgain = true) {
  return {
    granted,
    canAskAgain,
    status: granted ? 'granted' : 'denied',
    expires: 'never',
  } as ImagePicker.CameraPermissionResponse;
}

function asset(name: string) {
  return {
    uri: `file:///cache/${name}`,
    width: 4000,
    height: 3000,
  } as ImagePicker.ImagePickerAsset;
}

function picked(...names: string[]): ImagePicker.ImagePickerResult {
  return { canceled: false, assets: names.map(asset) };
}

const CANCELED: ImagePicker.ImagePickerResult = { canceled: true, assets: null };

let announced: jest.SpyInstance;
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  announced = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  requestCamera.mockResolvedValue(permission(true));
  getPending.mockResolvedValue(null);
  // The saved path follows the name of what was picked, so tests can read which is which.
  save.mockImplementation(async ({ uri }) => `record-photos/${uri.split('/').pop()}`);
});

afterEach(() => {
  warn.mockRestore();
});

describe('taking a photo', () => {
  it('saves what the camera gives back and says so', async () => {
    launchCamera.mockResolvedValue(picked('a.jpg'));
    const { result } = renderHook(() => usePhotoCapture());

    await act(() => result.current.takePhoto());

    expect(result.current.paths).toEqual(['record-photos/a.jpg']);
    expect(result.current.busy).toBe(false);
    expect(announced).toHaveBeenCalledWith('1 photo added.');
  });

  it('asks the camera for its full quality, because saving does the compressing', async () => {
    launchCamera.mockResolvedValue(CANCELED);
    const { result } = renderHook(() => usePhotoCapture());
    await act(() => result.current.takePhoto());
    expect(launchCamera).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
  });

  it('adds nothing when the camera is closed without a photo', async () => {
    launchCamera.mockResolvedValue(CANCELED);
    const { result } = renderHook(() => usePhotoCapture());
    await act(() => result.current.takePhoto());
    expect(result.current.paths).toEqual([]);
    expect(result.current.problem).toBeUndefined();
  });

  it('explains when camera access is refused and it can ask again', async () => {
    requestCamera.mockResolvedValue(permission(false));
    const { result } = renderHook(() => usePhotoCapture());
    await act(() => result.current.takePhoto());
    expect(launchCamera).not.toHaveBeenCalled();
    expect(result.current.problem).toBe('The app needs camera access to photograph the plant.');
    expect(result.current.needsSettings).toBe(false);
  });

  it('points to Settings when only Settings can give access back', async () => {
    requestCamera.mockResolvedValue(permission(false, false));
    const { result } = renderHook(() => usePhotoCapture());
    await act(() => result.current.takePhoto());
    expect(result.current.problem).toMatch(/Turn it on in Settings/);
    expect(result.current.needsSettings).toBe(true);
    expect(announced).toHaveBeenCalledWith(result.current.problem);
  });

  it("offers the library when the camera won't open, and clears that on the next try", async () => {
    launchCamera.mockRejectedValueOnce(new Error('no camera'));
    const { result } = renderHook(() => usePhotoCapture());
    await act(() => result.current.takePhoto());
    expect(result.current.problem).toMatch(/choose a photo from the library/);

    launchCamera.mockResolvedValue(picked('a.jpg'));
    await act(() => result.current.takePhoto());
    expect(result.current.problem).toBeUndefined();
    expect(result.current.paths).toHaveLength(1);
  });

  it('only opens the camera once when the button is tapped twice quickly', async () => {
    launchCamera.mockResolvedValue(picked('a.jpg'));
    const { result } = renderHook(() => usePhotoCapture());
    await act(async () => {
      await Promise.all([result.current.takePhoto(), result.current.takePhoto()]);
    });
    expect(launchCamera).toHaveBeenCalledTimes(1);
    expect(result.current.paths).toHaveLength(1);
  });
});

describe('choosing from the library', () => {
  it('only lets you pick as many as there is room for, and asks for no permission', async () => {
    launchLibrary.mockResolvedValue(picked('a.jpg', 'b.jpg'));
    const { result } = renderHook(() => usePhotoCapture());

    await act(() => result.current.choosePhotos());
    expect(launchLibrary).toHaveBeenLastCalledWith({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
    });
    expect(requestCamera).not.toHaveBeenCalled();
    expect(result.current.paths).toHaveLength(2);
    expect(announced).toHaveBeenCalledWith('2 photos added.');

    await act(() => result.current.choosePhotos());
    expect(launchLibrary.mock.lastCall?.[0]?.selectionLimit).toBe(MAX_PHOTOS - 2);
  });

  it('cuts off a library that hands back too many', async () => {
    launchLibrary.mockResolvedValue(picked('a', 'b', 'c', 'd', 'e', 'f', 'g'));
    const { result } = renderHook(() => usePhotoCapture());
    await act(() => result.current.choosePhotos());
    expect(result.current.paths).toHaveLength(MAX_PHOTOS);
  });

  it("says so when the library won't open", async () => {
    launchLibrary.mockRejectedValue(new Error('no library'));
    const { result } = renderHook(() => usePhotoCapture());
    await act(() => result.current.choosePhotos());
    expect(result.current.problem).toBe("The photo library wouldn't open. Please try again.");
  });

  it("keeps the ones that saved and says how many didn't", async () => {
    launchLibrary.mockResolvedValue(picked('a', 'b', 'c'));
    save.mockRejectedValueOnce(new Error('out of space')).mockRejectedValueOnce(new Error('again'));
    const { result } = renderHook(() => usePhotoCapture());
    await act(() => result.current.choosePhotos());
    expect(result.current.paths).toEqual(['record-photos/c']);
    expect(result.current.problem).toMatch(/^Couldn't save 2 photos\. /);
  });

  it('says that photo when the only one fails', async () => {
    launchLibrary.mockResolvedValue(picked('a'));
    save.mockRejectedValueOnce(new Error('out of space'));
    const { result } = renderHook(() => usePhotoCapture());
    await act(() => result.current.choosePhotos());
    expect(result.current.problem).toMatch(/^Couldn't save that photo\. /);
  });
});

describe('changing what is on the form', () => {
  async function formWith(...names: string[]) {
    launchLibrary.mockResolvedValue(picked(...names));
    const hook = renderHook(() => usePhotoCapture());
    await act(() => hook.result.current.choosePhotos());
    return hook;
  }

  it('removes the right one, deletes its file and keeps the rest in order', async () => {
    const { result } = await formWith('a', 'b', 'c');
    act(() => result.current.remove('record-photos/b'));
    expect(result.current.paths).toEqual(['record-photos/a', 'record-photos/c']);
    expect(deleteFile).toHaveBeenCalledWith('record-photos/b');
    expect(announced).toHaveBeenCalledWith('Photo removed.');
  });

  it('empties the form without deleting anything, because the saved record owns the files', async () => {
    const { result } = await formWith('a');
    act(() => result.current.clear());
    expect(result.current.paths).toEqual([]);
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

describe('when Android closes the app while the camera is open', () => {
  const realOS = Platform.OS;

  afterEach(() => {
    Platform.OS = realOS;
  });

  it('gets the photo back when the app starts again', async () => {
    Platform.OS = 'android';
    getPending.mockResolvedValue(picked('a.jpg'));
    const { result } = renderHook(() => usePhotoCapture());
    await waitFor(() => expect(result.current.paths).toEqual(['record-photos/a.jpg']));
  });

  it('adds nothing when the camera was closed without a photo, or it failed', async () => {
    Platform.OS = 'android';
    getPending.mockResolvedValueOnce(CANCELED);
    const first = renderHook(() => usePhotoCapture());
    await waitFor(() => expect(getPending).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(first.result.current.paths).toEqual([]);

    getPending.mockResolvedValueOnce({ code: 'ERR', message: 'failed' });
    const second = renderHook(() => usePhotoCapture());
    await waitFor(() => expect(getPending).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(second.result.current.paths).toEqual([]);
  });

  it('warns and carries on if asking fails', async () => {
    Platform.OS = 'android';
    getPending.mockRejectedValue(new Error('nope'));
    renderHook(() => usePhotoCapture());
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "Couldn't get the photo back from the camera.",
        expect.any(Error),
      ),
    );
  });

  it("doesn't ask on iOS, where the app isn't closed for this", async () => {
    Platform.OS = 'ios';
    renderHook(() => usePhotoCapture());
    await act(async () => {});
    expect(getPending).not.toHaveBeenCalled();
  });
});

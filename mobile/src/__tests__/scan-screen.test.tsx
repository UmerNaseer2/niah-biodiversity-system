import {
  PermissionStatus,
  scanFromURLAsync,
  useCameraPermissions,
  type BarcodeScanningResult,
  type PermissionResponse,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { deleteDatabaseAsync } from 'expo-sqlite';
import { AccessibilityInfo, AppState, Linking } from 'react-native';

import ScanScreen from '@/app/(tabs)/scan';
import PlantScreen from '@/app/plant/[tag]';
import RecordScreen from '@/app/record/[id]';
import { DATABASE_NAME } from '@/db/database';
import { openRecordsStore } from '@/db/records-store';
import { RESCAN_AFTER_MS, tagQrText } from '@/lib/qr';
import { AccountProvider } from '@/state/account-context';
import { RecordsProvider } from '@/state/records-context';

jest.mock('expo-camera', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    // The real camera needs a phone. This one keeps the props it gets, so the test can send it
    // QR codes the way the camera would.
    CameraView: (props: object) => createElement(View, { testID: 'camera', ...props }),
    PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
    useCameraPermissions: jest.fn(),
    scanFromURLAsync: jest.fn(),
  };
});
jest.mock('expo-image-picker');

const BELIAN_ID = '3f2a9c4e-8b1d-4c6a-9e2f-7a1b5c3d9e01';
const PITCHER_PLANT_ID = '8c41e7b2-5d3f-4a9e-b6c1-2e8f4a7d1c02';
const SAVED_FIG_ID = 'b7e3f9d1-2c4a-4e6b-8d0f-1a3c5e7b9d20';

const granted: PermissionResponse = {
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
};
const notAskedYet: PermissionResponse = {
  ...granted,
  status: PermissionStatus.UNDETERMINED,
  granted: false,
};
const turnedDownOnce: PermissionResponse = {
  ...granted,
  status: PermissionStatus.DENIED,
  granted: false,
};
const turnedOff: PermissionResponse = { ...turnedDownOnce, canAskAgain: false };

const requestPermission = jest.fn<Promise<PermissionResponse>, []>();
const getPermission = jest.fn<Promise<PermissionResponse>, []>();

function cameraAccess(permission: PermissionResponse | null) {
  jest.mocked(useCameraPermissions).mockReturnValue([permission, requestPermission, getPermission]);
}

// renderRouter turns on Jest's fake timers, so the clock the screen reads only moves when a test
// moves it.
function letTimePass(ms: number) {
  act(() => jest.advanceTimersByTime(ms));
}

function TestLayout() {
  return (
    <AccountProvider>
      <RecordsProvider>
        <Stack />
      </RecordsProvider>
    </AccountProvider>
  );
}

/** Opens the Scan screen once the records saved on the phone have loaded. */
async function renderScan() {
  const app = renderRouter(
    {
      _layout: TestLayout,
      scan: ScanScreen,
      'record/[id]': RecordScreen,
      'plant/[tag]': PlantScreen,
    },
    { initialUrl: '/scan' },
  );
  await screen.findByLabelText('Tag code');
  return app;
}

const chooseFromLibrary = jest.mocked(ImagePicker.launchImageLibraryAsync);
const readQrCodes = jest.mocked(scanFromURLAsync);

const PHOTO_URI = 'file:///picked/tag.jpg';

/** The library hands back one photo, and these are the QR codes read out of it. */
function photoWith(...texts: string[]) {
  chooseFromLibrary.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: PHOTO_URI, width: 3024, height: 4032 }],
  });
  readQrCodes.mockResolvedValueOnce(
    texts.map(
      (data): BarcodeScanningResult => ({
        type: 'qr',
        data,
        cornerPoints: [],
        bounds: { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } },
      }),
    ),
  );
}

const photoButton = () => screen.getByRole('button', { name: 'Choose a photo' });

/** Presses Choose a photo and waits for the photo to be read. */
async function choosePhoto() {
  fireEvent.press(photoButton());
  expect(await screen.findByRole('button', { name: 'Choose a photo' })).toBeEnabled();
}

const camera = () => screen.getByTestId('camera');
const tagCodeBox = () => screen.getByLabelText('Tag code');

/** Sends QR codes the way the camera does, all of them before the screen gets to update. */
function scan(...codes: string[]) {
  const { onBarcodeScanned } = camera().props;
  act(() => {
    for (const data of codes) {
      onBarcodeScanned({ type: 'qr', data });
    }
  });
}

/** Acts like the camera starting up, which takes a moment on a real phone. */
function cameraStarts() {
  const { onCameraReady } = camera().props;
  act(() => onCameraReady());
}

/** Acts like the app coming back to the front, like after a trip to Settings. */
function comeBackToApp() {
  act(() => {
    for (const [event, listener] of jest.mocked(AppState.addEventListener).mock.calls) {
      if (event === 'change') {
        listener('active');
      }
    }
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  cameraAccess(granted);
  requestPermission.mockResolvedValue(granted);
  getPermission.mockResolvedValue(granted);
  // Every test starts with nothing saved on the phone.
  await deleteDatabaseAsync(DATABASE_NAME);
});

describe('Scan screen camera access', () => {
  it('waits for the camera access check before starting the camera', async () => {
    cameraAccess(null);
    await renderScan();
    expect(screen.getByText('Checking camera access…')).toBeVisible();
    expect(screen.queryByTestId('camera')).toBeNull();
    // Typing the code still works while it checks.
    expect(tagCodeBox()).toBeVisible();
  });

  it.each([
    ['not asked yet', notAskedYet],
    ['turned down once', turnedDownOnce],
  ])('asks for the camera when access is %s', async (_what, permission) => {
    cameraAccess(permission);
    await renderScan();
    expect(
      screen.getByText('The app needs the camera to read the QR tag on each plant.'),
    ).toBeVisible();
    expect(screen.queryByTestId('camera')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('points to Settings when camera access is turned off', async () => {
    cameraAccess(turnedOff);
    const openSettings = jest.mocked(Linking.openSettings).mockResolvedValue(undefined);
    await renderScan();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Camera access is off for this app. Turn it on in Settings, then come back here.',
    );
    expect(screen.queryByRole('button', { name: 'Allow camera' })).toBeNull();
    expect(screen.queryByTestId('camera')).toBeNull();
    expect(tagCodeBox()).toBeVisible();

    fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('checks camera access again when the app comes back to the front', async () => {
    cameraAccess(turnedOff);
    await renderScan();
    expect(getPermission).not.toHaveBeenCalled();

    comeBackToApp();
    expect(getPermission).toHaveBeenCalledTimes(1);
  });
});

describe('Scan screen camera', () => {
  it('shows the camera, looking for QR codes only', async () => {
    await renderScan();
    expect(screen.getByLabelText('Camera. Point it at the QR tag on the plant.')).toBeVisible();
    expect(camera().props.barcodeScannerSettings).toEqual({ barcodeTypes: ['qr'] });
    expect(camera().props.enableTorch).toBe(false);
    // Left to the camera, which keeps refocusing as the phone moves.
    expect(camera().props.autofocus).toBeUndefined();
  });

  it('turns the torch on and off', async () => {
    await renderScan();
    fireEvent.press(screen.getByRole('button', { name: 'Turn torch on' }));
    expect(camera().props.enableTorch).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: 'Turn torch off' }));
    expect(camera().props.enableTorch).toBe(false);
    expect(screen.getByRole('button', { name: 'Turn torch on' })).toBeVisible();
  });

  it('turns the camera and torch off while a record is open', async () => {
    await renderScan();
    fireEvent.press(screen.getByRole('button', { name: 'Turn torch on' }));
    scan('NNP-3F2A9C');
    expect(screen.getByText('Tag NNP-3F2A9C')).toBeVisible();
    expect(screen.queryByTestId('camera', { includeHiddenElements: true })).toBeNull();

    testRouter.back('/scan');
    expect(camera().props.enableTorch).toBe(false);
    expect(screen.getByRole('button', { name: 'Turn torch on' })).toBeVisible();
  });

  it("says so when the camera can't start, and tries again", async () => {
    await renderScan();
    act(() => camera().props.onMountError({ message: 'Camera is in use' }));
    const message = "The camera couldn't start. Try again, or type the tag code below.";
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
    expect(screen.queryByTestId('camera')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(camera()).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Scanning a tag', () => {
  it('opens the record for the plant tag', async () => {
    const app = await renderScan();
    scan('NNP-3F2A9C');
    expect(app.getPathname()).toBe(`/record/${BELIAN_ID}`);
    expect(screen.getByText('Tag NNP-3F2A9C')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Eusideroxylon zwageri' })).toBeVisible();
  });

  it('opens the record from a link to the tag page on the website', async () => {
    const app = await renderScan();
    scan('https://niah.example.org/tag/nnp-8c41e7');
    expect(app.getPathname()).toBe(`/record/${PITCHER_PLANT_ID}`);
    expect(screen.getByText('Tag NNP-8C41E7')).toBeVisible();
  });

  it('opens the record from a code only tag, which holds no web address', async () => {
    // A protected or threatened plant's tag holds just its code (lib/tag-rule.ts)
    const app = await renderScan();
    scan(tagQrText('NNP-8C41E7', undefined));
    expect(app.getPathname()).toBe(`/record/${PITCHER_PLANT_ID}`);
    expect(screen.getByText('Tag NNP-8C41E7')).toBeVisible();
  });

  it("says so when the QR code isn't a plant tag", async () => {
    const app = await renderScan();
    scan('WIFI:T:WPA;S:ParkOffice;P:secret;;');
    const message = "That QR code isn't a Niah plant tag.";
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
    expect(app.getPathname()).toBe('/scan');
  });

  it("opens the plant page to look up a tag that isn't on this phone", async () => {
    // Someone else may have recorded it. The lookup itself is in server-plant.test.tsx, and this
    // build isn't linked to a server.
    const app = await renderScan();
    scan('NNP-ABCDEF');
    expect(app.getPathname()).toBe('/plant/NNP-ABCDEF');
    expect(await screen.findByText("Can't look up plants")).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reads a problem out once while the QR code stays in view', async () => {
    await renderScan();
    scan('Hello from Niah');
    for (let i = 0; i < 20; i++) {
      letTimePass(100);
      scan('Hello from Niah');
    }
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);

    // Pointing the camera at it again reads it out again, even though the text is the same.
    letTimePass(RESCAN_AFTER_MS);
    scan('Hello from Niah');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(2);
  });

  it('clears the problem once a plant tag is scanned', async () => {
    await renderScan();
    scan('Hello from Niah');
    expect(screen.getByRole('alert')).toBeVisible();

    scan('NNP-3F2A9C');
    testRouter.back('/scan');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens a record saved on this phone before the app was opened', async () => {
    // Saved straight into the database, like a record from before the app was closed.
    const store = await openRecordsStore();
    await store.saveRecord({
      id: SAVED_FIG_ID,
      tagCode: 'NNP-B7E3F9',
      speciesName: 'Ficus sp.',
      condition: 'healthy',
      // A made up point near the park HQ.
      location: {
        latitude: 3.81402,
        longitude: 113.77911,
        accuracyM: 7,
        capturedAt: '2026-10-16T01:20:00.000Z',
      },
      photoCount: 0,
      recordedAt: '2026-10-16T01:20:30.000Z',
      syncStatus: 'pending',
    });
    await store.close();

    const app = await renderScan();
    scan('NNP-B7E3F9');
    expect(app.getPathname()).toBe(`/record/${SAVED_FIG_ID}`);
    expect(screen.getByText('Tag NNP-B7E3F9')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Ficus sp.' })).toBeVisible();
    expect(screen.getByText('3.81402° N, 113.77911° E')).toBeVisible();
  });

  it('opens only one record when two tags are scanned at once', async () => {
    const app = await renderScan();
    scan('NNP-3F2A9C', 'NNP-8C41E7');
    expect(app.getPathname()).toBe(`/record/${BELIAN_ID}`);
    // If the second tag had opened a record too, going back would land on the first record.
    testRouter.back('/scan');
  });

  it("doesn't open the same record again while its tag is still in view", async () => {
    const app = await renderScan();
    scan('NNP-3F2A9C');
    letTimePass(5000);
    testRouter.back('/scan');
    // A slow phone can take a couple of seconds to start the camera again.
    letTimePass(2000);
    cameraStarts();

    // The tag is still in front of the camera for 3 seconds.
    for (let i = 0; i < 30; i++) {
      letTimePass(100);
      scan('NNP-3F2A9C');
    }
    expect(app.getPathname()).toBe('/scan');

    // Moving the camera away and back opens it again.
    letTimePass(RESCAN_AFTER_MS);
    scan('NNP-3F2A9C');
    expect(app.getPathname()).toBe(`/record/${BELIAN_ID}`);
  });

  it('opens a different tag straight away after coming back', async () => {
    const app = await renderScan();
    scan('NNP-3F2A9C');
    testRouter.back('/scan');
    cameraStarts();

    letTimePass(100);
    scan('NNP-8C41E7');
    expect(app.getPathname()).toBe(`/record/${PITCHER_PLANT_ID}`);
  });
});

describe('Scanning a photo of a tag', () => {
  it('opens the record for the tag in the photo', async () => {
    const app = await renderScan();
    photoWith('https://niah.example.org/tag/NNP-3F2A9C');
    fireEvent.press(photoButton());
    expect(await screen.findByText('Tag NNP-3F2A9C')).toBeVisible();
    expect(app.getPathname()).toBe(`/record/${BELIAN_ID}`);
    expect(chooseFromLibrary).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
    expect(readQrCodes).toHaveBeenCalledWith(PHOTO_URI, ['qr']);
  });

  it('opens the tag when the photo has other QR codes in it too', async () => {
    const app = await renderScan();
    photoWith('https://example.com/menu', 'NNP-8C41E7');
    fireEvent.press(photoButton());
    expect(await screen.findByText('Tag NNP-8C41E7')).toBeVisible();
    expect(app.getPathname()).toBe(`/record/${PITCHER_PLANT_ID}`);
  });

  it('stays on the Scan tab when no photo is chosen', async () => {
    const app = await renderScan();
    chooseFromLibrary.mockResolvedValueOnce({ canceled: true, assets: null });
    await choosePhoto();
    expect(app.getPathname()).toBe('/scan');
    expect(readQrCodes).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    [
      'has no QR code',
      [],
      "Couldn't find a QR code in that photo. Try one that's closer and in focus.",
    ],
    [
      'has two different tags',
      ['NNP-3F2A9C', 'NNP-8C41E7'],
      'That photo has 2 different tags in it. Choose a photo of just one.',
    ],
    [
      "has a QR code that isn't a tag",
      ['https://example.com'],
      "That QR code isn't a Niah plant tag.",
    ],
  ])('says so when the photo %s', async (_what, texts, message) => {
    const app = await renderScan();
    photoWith(...texts);
    await choosePhoto();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
    expect(app.getPathname()).toBe('/scan');
  });

  it("says so when the library won't open", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderScan();
    chooseFromLibrary.mockRejectedValueOnce(new Error('No activity'));
    await choosePhoto();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "The photo library wouldn't open. Please try again.",
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("says so when the photo can't be read, and clears it on the next try", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderScan();
    chooseFromLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: PHOTO_URI, width: 10, height: 10 }],
    });
    readQrCodes.mockRejectedValueOnce(new Error('Could not load the image'));
    await choosePhoto();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't read that photo. Try another one, or type the tag code below.",
    );
    warn.mockRestore();

    photoWith('NNP-3F2A9C');
    fireEvent.press(photoButton());
    expect(await screen.findByText('Tag NNP-3F2A9C')).toBeVisible();
    testRouter.back('/scan');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('only reads one photo at a time', async () => {
    await renderScan();
    let finishPicking!: (result: ImagePicker.ImagePickerResult) => void;
    chooseFromLibrary.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPicking = resolve;
      }),
    );
    fireEvent.press(photoButton());
    const busy = await screen.findByRole('button', { name: 'Reading the photo…' });
    expect(busy).toBeDisabled();
    fireEvent.press(busy);
    expect(chooseFromLibrary).toHaveBeenCalledTimes(1);

    await act(async () => finishPicking({ canceled: true, assets: null }));
    expect(photoButton()).toBeEnabled();
  });

  it('still works when camera access is turned off', async () => {
    cameraAccess(turnedOff);
    const app = await renderScan();
    photoWith('NNP-3F2A9C');
    fireEvent.press(photoButton());
    expect(await screen.findByText('Tag NNP-3F2A9C')).toBeVisible();
    expect(app.getPathname()).toBe(`/record/${BELIAN_ID}`);
  });
});

describe('Typing the tag code', () => {
  it('finds the record from a code typed in any case, with or without NNP', async () => {
    const app = await renderScan();
    const findButton = screen.getByRole('button', { name: 'Find plant' });
    expect(findButton).toBeDisabled();

    fireEvent.changeText(tagCodeBox(), ' 3f2a9c ');
    fireEvent.press(findButton);
    expect(app.getPathname()).toBe(`/record/${BELIAN_ID}`);

    testRouter.back('/scan');
    expect(tagCodeBox()).toHaveDisplayValue('');
  });

  it("says so when what's typed isn't a tag code, until it changes", async () => {
    await renderScan();
    fireEvent.changeText(tagCodeBox(), 'NNP-ABCDE');
    fireEvent(tagCodeBox(), 'submitEditing');
    expect(screen.getByRole('alert')).toHaveTextContent(
      "That isn't a tag code. They look like NNP-3F2A9C.",
    );

    fireEvent.changeText(tagCodeBox(), 'NNP-ABCDEF');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens the plant page to look up a typed code that isn\'t on this phone', async () => {
    const app = await renderScan();
    fireEvent.changeText(tagCodeBox(), 'abcdef');
    fireEvent(tagCodeBox(), 'submitEditing');
    expect(app.getPathname()).toBe('/plant/NNP-ABCDEF');
  });
});

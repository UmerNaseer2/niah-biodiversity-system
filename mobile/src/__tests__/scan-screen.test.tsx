import { PermissionStatus, useCameraPermissions, type PermissionResponse } from 'expo-camera';
import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { deleteDatabaseAsync } from 'expo-sqlite';
import { AccessibilityInfo, AppState, Linking } from 'react-native';

import ScanScreen from '@/app/(tabs)/scan';
import RecordScreen from '@/app/record/[id]';
import { DATABASE_NAME } from '@/db/database';
import { openRecordsStore } from '@/db/records-store';
import { RESCAN_AFTER_MS } from '@/lib/qr';
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
  };
});

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
    { _layout: TestLayout, scan: ScanScreen, 'record/[id]': RecordScreen },
    { initialUrl: '/scan' },
  );
  await screen.findByLabelText('Tag code');
  return app;
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

  it("says so when the QR code isn't a plant tag", async () => {
    const app = await renderScan();
    scan('WIFI:T:WPA;S:ParkOffice;P:secret;;');
    const message = "That QR code isn't a Niah plant tag.";
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
    expect(app.getPathname()).toBe('/scan');
  });

  it('says so when no record on this phone has the tag', async () => {
    const app = await renderScan();
    scan('NNP-ABCDEF');
    const message = 'No record with tag NNP-ABCDEF on this phone.';
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
    expect(app.getPathname()).toBe('/scan');
  });

  it('reads a problem out once while the QR code stays in view', async () => {
    await renderScan();
    scan('NNP-ABCDEF');
    for (let i = 0; i < 20; i++) {
      letTimePass(100);
      scan('NNP-ABCDEF');
    }
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);

    // Pointing the camera at it again reads it out again, even though the text is the same.
    letTimePass(RESCAN_AFTER_MS);
    scan('NNP-ABCDEF');
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

describe('Typing the tag code', () => {
  it('finds the record from a code typed in any case, with or without NNP', async () => {
    const app = await renderScan();
    const findButton = screen.getByRole('button', { name: 'Find record' });
    expect(findButton).toBeDisabled();

    fireEvent.changeText(tagCodeBox(), ' 3f2a9c ');
    fireEvent.press(findButton);
    expect(app.getPathname()).toBe(`/record/${BELIAN_ID}`);

    testRouter.back('/scan');
    expect(tagCodeBox()).toHaveDisplayValue('');
  });

  it('says so when no record has the typed code, until the code changes', async () => {
    await renderScan();
    fireEvent.changeText(tagCodeBox(), 'NNP-ABCDEF');
    fireEvent(tagCodeBox(), 'submitEditing');
    expect(screen.getByRole('alert')).toHaveTextContent('No record with that tag on this phone.');

    fireEvent.changeText(tagCodeBox(), 'NNP-ABCDE');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

import { PermissionStatus, useCameraPermissions, type PermissionResponse } from 'expo-camera';
import { Stack } from 'expo-router';
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
  waitFor,
} from 'expo-router/testing-library';
import { deleteDatabaseAsync } from 'expo-sqlite';
import { AccessibilityInfo } from 'react-native';

import HistoryScreen from '@/app/(tabs)/history';
import ScanScreen from '@/app/(tabs)/scan';
import PlantScreen from '@/app/plant/[tag]';
import RecordScreen from '@/app/record/[id]';
import { DATABASE_NAME } from '@/db/database';
import { openRecordsStore } from '@/db/records-store';
import { AccountProvider } from '@/state/account-context';
import { RecordsProvider } from '@/state/records-context';
import type { AppMode } from '@/types/app-mode';
import type { PublicRecord, PublicSpecies, ScanEntry } from '@/types/public-copy';

// Scanning and typing tags against the plant info saved on the phone, and the History tab, with
// the real database underneath. The plant page and History on their own are tested in
// plant-screen.test.tsx and history-screen.test.tsx.

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

const granted: PermissionResponse = {
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
};

const requestPermission = jest.fn<Promise<PermissionResponse>, []>();
const getPermission = jest.fn<Promise<PermissionResponse>, []>();

// Made-up plant info. Like the real copy, the plants have no location.
const PITCHER: PublicSpecies = {
  slug: 'nepenthes-rafflesiana',
  scientificName: 'Nepenthes rafflesiana',
  authority: 'Jack',
  family: 'Nepenthaceae',
  commonNames: ['Raffles pitcher plant', 'Periuk kera'],
  iucnCode: 'LC',
  sarawakProtected: true,
  summary: 'A pitcher plant that traps insects.',
  about: '',
  habitat: '',
  uses: '',
};

const PITCHER_PLANT: PublicRecord = {
  id: 'e1a2b3c4-5d6e-4f70-8a9b-0c1d2e3f4a51',
  tagCode: 'NNP-E1A2B3',
  speciesSlug: 'nepenthes-rafflesiana',
  speciesName: 'Nepenthes rafflesiana',
  commonName: 'Raffles pitcher plant',
  heightM: 1.5,
  condition: 'healthy',
  recordedAt: '2026-10-20T02:30:00.000Z',
};

const FIG_PLANT: PublicRecord = {
  id: '9b8c7d6e-1f2a-4b3c-8d4e-5f6a7b8c9d02',
  tagCode: 'NNP-9B8C7D',
  speciesName: 'Ficus sp.',
  recordedAt: '2026-10-19T16:00:00.000Z',
};

// The same tag as one of the sample records staff see, so the tests can tell which one opens.
const BELIAN_COPY: PublicRecord = {
  id: BELIAN_ID,
  tagCode: 'NNP-3F2A9C',
  speciesName: 'Eusideroxylon zwageri',
  commonName: 'Belian',
  recordedAt: '2026-10-14T03:00:00.000Z',
};

const PLANTS = [PITCHER_PLANT, FIG_PLANT, BELIAN_COPY];
const DOWNLOADED = '2026-11-04T06:15:00.000Z';

// Made-up scans from before the app was opened, in no particular order.
const SAVED_SCANS: ScanEntry[] = [
  { tagCode: 'NNP-9B8C7D', scannedAt: '2026-11-03T01:00:00.000Z' },
  { tagCode: 'NNP-E1A2B3', scannedAt: '2026-11-04T01:00:00.000Z' },
  { tagCode: 'NNP-A1B2C3', scannedAt: '2026-11-02T01:00:00.000Z' },
];

const SHOWS_LATER = "It'll show once this phone is online and the plant info updates.";
const NO_SCANS = 'No scans yet. Tags you scan show up here.';

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

/** Saves who uses this phone and a copy of the plant info, like after the first open. */
async function savePlantInfo(mode: AppMode, scans: ScanEntry[] = []) {
  const store = await openRecordsStore();
  try {
    await store.saveMode(mode);
    await store.replacePublicCopy([PITCHER], PLANTS, DOWNLOADED);
    for (const { tagCode, scannedAt } of scans) {
      await store.saveScan(tagCode, scannedAt);
    }
  } finally {
    await store.close();
  }
}

/** The tags in History on the phone, read straight from the database. */
async function savedScans() {
  const store = await openRecordsStore();
  try {
    return (await store.loadScans()).map((entry) => entry.tagCode);
  } finally {
    await store.close();
  }
}

/** Opens a page once the records saved on the phone have loaded. */
async function renderApp(initialUrl: '/scan' | '/history' = '/scan') {
  const app = renderRouter(
    {
      _layout: TestLayout,
      scan: ScanScreen,
      history: HistoryScreen,
      'plant/[tag]': PlantScreen,
      'record/[id]': RecordScreen,
    },
    { initialUrl },
  );
  if (initialUrl === '/scan') {
    await screen.findByLabelText('Tag code');
  } else {
    await screen.findByRole('heading', { name: 'History' });
  }
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

/** Goes back to Scan from a plant page, and starts the camera again like a real phone does. */
function backToScan() {
  testRouter.back('/scan');
  cameraStarts();
}

/** The rows in History from top to bottom, by what a screen reader says for each one. */
function historyRows(): string[] {
  return screen
    .queryAllByLabelText(/, (tag NNP-\w{6}|no plant info yet), /)
    .map((row) => row.props.accessibilityLabel ?? row.props['aria-label']);
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(useCameraPermissions).mockReturnValue([granted, requestPermission, getPermission]);
  requestPermission.mockResolvedValue(granted);
  getPermission.mockResolvedValue(granted);
  // Every test starts with nothing saved on the phone.
  await deleteDatabaseAsync(DATABASE_NAME);
});

describe('A visitor scanning a tag', () => {
  it('opens the plant page from the plant info saved on the phone', async () => {
    await savePlantInfo('visitor');
    const app = await renderApp();
    scan('NNP-E1A2B3');
    expect(app.getPathname()).toBe('/plant/NNP-E1A2B3');
    expect(screen.getByText('Tag NNP-E1A2B3')).toBeVisible();
    // Waiting here also lets the scan finish saving to History.
    expect(await screen.findByRole('heading', { name: 'Raffles pitcher plant' })).toBeVisible();
  });

  it('opens the plant page from a link to the tag page on the website', async () => {
    await savePlantInfo('visitor');
    const app = await renderApp();
    scan('https://niah.example.org/tag/nnp-e1a2b3');
    expect(app.getPathname()).toBe('/plant/NNP-E1A2B3');
    expect(await screen.findByRole('heading', { name: 'Raffles pitcher plant' })).toBeVisible();
  });

  it("says there's no plant info yet for a tag that isn't in the saved copy", async () => {
    await savePlantInfo('visitor');
    const app = await renderApp();
    scan('NNP-A1B2C3');
    const message = `No plant info for tag NNP-A1B2C3 yet. ${SHOWS_LATER}`;
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
    expect(app.getPathname()).toBe('/scan');

    // It still goes in History, so the visitor can find it again once the info comes down.
    testRouter.navigate('/history');
    expect(await screen.findByLabelText(/^Tag NNP-A1B2C3, no plant info yet, /)).toBeVisible();
  });

  it('opens the plant info, not the sample staff record with the same tag', async () => {
    await savePlantInfo('visitor');
    const app = await renderApp();
    scan('NNP-3F2A9C');
    expect(app.getPathname()).toBe('/plant/NNP-3F2A9C');
    expect(await screen.findByRole('heading', { name: 'Belian' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Eusideroxylon zwageri' })).toBeNull();
  });

  it("doesn't open the sample records staff see", async () => {
    await savePlantInfo('visitor');
    const app = await renderApp();
    scan('NNP-8C41E7');
    const message = `No plant info for tag NNP-8C41E7 yet. ${SHOWS_LATER}`;
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(app.getPathname()).toBe('/scan');

    testRouter.navigate('/history');
    expect(await screen.findByLabelText(/^Tag NNP-8C41E7, no plant info yet, /)).toBeVisible();
  });

  it("doesn't keep a QR code that isn't a plant tag", async () => {
    await savePlantInfo('visitor');
    await renderApp();
    scan('Hello from Niah');
    expect(screen.getByRole('alert')).toHaveTextContent("That QR code isn't a Niah plant tag.");

    testRouter.navigate('/history');
    expect(await screen.findByText(NO_SCANS)).toBeVisible();
    expect(await savedScans()).toEqual([]);
  });
});

describe('A visitor typing a tag code', () => {
  it('finds the plant from a code typed in any case, with or without NNP', async () => {
    await savePlantInfo('visitor');
    const app = await renderApp();
    const findButton = screen.getByRole('button', { name: 'Find plant' });
    expect(findButton).toBeDisabled();

    fireEvent.changeText(tagCodeBox(), ' e1a2b3 ');
    fireEvent.press(findButton);
    expect(app.getPathname()).toBe('/plant/NNP-E1A2B3');

    testRouter.back('/scan');
    expect(tagCodeBox()).toHaveDisplayValue('');
    fireEvent.changeText(tagCodeBox(), 'nnp-e1a2b3');
    fireEvent(tagCodeBox(), 'submitEditing');
    expect(app.getPathname()).toBe('/plant/NNP-E1A2B3');

    // Both go in History as the one tag.
    testRouter.navigate('/history');
    await waitFor(() =>
      expect(historyRows()).toEqual([
        expect.stringMatching(/^Raffles pitcher plant, tag NNP-E1A2B3, /),
      ]),
    );
  });

  it("says so when the saved plant info doesn't have the typed code", async () => {
    await savePlantInfo('visitor');
    const app = await renderApp();
    fireEvent.changeText(tagCodeBox(), 'NNP-A1B2C3');
    fireEvent(tagCodeBox(), 'submitEditing');
    expect(screen.getByRole('alert')).toHaveTextContent(
      `No plant info for that tag yet. ${SHOWS_LATER}`,
    );
    expect(app.getPathname()).toBe('/scan');

    testRouter.navigate('/history');
    expect(await screen.findByLabelText(/^Tag NNP-A1B2C3, no plant info yet, /)).toBeVisible();
  });

  it("only keeps a typed code with no plant info when it's a whole tag code", async () => {
    await savePlantInfo('visitor');
    await renderApp();
    // A code that isn't in the plant info only goes in History when it has the NNP part, the same
    // as on a QR code, so half a code typed by mistake doesn't end up there.
    for (const code of ['NNP-A1B2', 'A1B2C3', 'NNP-A1B2C3']) {
      fireEvent.changeText(tagCodeBox(), code);
      fireEvent(tagCodeBox(), 'submitEditing');
    }

    testRouter.navigate('/history');
    await waitFor(() =>
      expect(historyRows()).toEqual([
        expect.stringMatching(/^Tag NNP-A1B2C3, no plant info yet, /),
      ]),
    );
    expect(await savedScans()).toEqual(['NNP-A1B2C3']);
  });
});

describe('History', () => {
  it('shows the scans saved before the app was opened, newest first', async () => {
    await savePlantInfo('visitor', SAVED_SCANS);
    await renderApp('/history');
    expect(historyRows()).toEqual([
      expect.stringMatching(/^Raffles pitcher plant, tag NNP-E1A2B3, /),
      expect.stringMatching(/^Ficus sp\., tag NNP-9B8C7D, /),
      expect.stringMatching(/^Tag NNP-A1B2C3, no plant info yet, /),
    ]);
  });

  it('lists scans newest first, and moves a tag scanned again to the top', async () => {
    await savePlantInfo('visitor');
    await renderApp();
    scan('NNP-E1A2B3');
    backToScan();
    letTimePass(60_000);
    scan('NNP-A1B2C3');
    letTimePass(60_000);
    scan('NNP-9B8C7D');
    backToScan();
    letTimePass(60_000);
    scan('NNP-E1A2B3');
    testRouter.back('/scan');

    testRouter.navigate('/history');
    await waitFor(() =>
      expect(historyRows()).toEqual([
        expect.stringMatching(/^Raffles pitcher plant, tag NNP-E1A2B3, /),
        expect.stringMatching(/^Ficus sp\., tag NNP-9B8C7D, /),
        expect.stringMatching(/^Tag NNP-A1B2C3, no plant info yet, /),
      ]),
    );
    expect(await savedScans()).toEqual(['NNP-E1A2B3', 'NNP-9B8C7D', 'NNP-A1B2C3']);
  });

  it('opens the plant page from a row', async () => {
    await savePlantInfo('visitor', SAVED_SCANS);
    const app = await renderApp('/history');
    fireEvent.press(screen.getByLabelText(/^Raffles pitcher plant, tag NNP-E1A2B3, /));
    expect(await screen.findByRole('heading', { name: 'Raffles pitcher plant' })).toBeVisible();
    expect(app.getPathname()).toBe('/plant/NNP-E1A2B3');
  });

  it("says there's no plant info yet from the row of a tag with none", async () => {
    await savePlantInfo('visitor', SAVED_SCANS);
    const app = await renderApp('/history');
    fireEvent.press(screen.getByLabelText(/^Tag NNP-A1B2C3, no plant info yet, /));
    expect(
      await screen.findByRole('heading', { name: 'No plant info for this tag yet' }),
    ).toBeVisible();
    expect(app.getPathname()).toBe('/plant/NNP-A1B2C3');

    fireEvent.press(screen.getByRole('button', { name: 'Scan a plant tag' }));
    expect(app.getPathname()).toBe('/scan');
    expect(await screen.findByLabelText('Tag code')).toBeVisible();
  });

  it('clears every scan off the phone after asking first', async () => {
    await savePlantInfo('visitor', SAVED_SCANS);
    await renderApp('/history');
    fireEvent.press(screen.getByRole('button', { name: 'Clear history' }));
    fireEvent.press(screen.getByRole('button', { name: 'Clear it' }));
    expect(await screen.findByText(NO_SCANS)).toBeVisible();
    expect(historyRows()).toEqual([]);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('History cleared.');
    expect(await savedScans()).toEqual([]);
  });
});

describe('Staff scanning a tag', () => {
  it("opens the saved plant info for a tag that isn't one of their records", async () => {
    await savePlantInfo('staff');
    const app = await renderApp();
    expect(screen.getByRole('button', { name: 'Find record' })).toBeVisible();
    scan('NNP-E1A2B3');
    expect(app.getPathname()).toBe('/plant/NNP-E1A2B3');
    expect(await screen.findByRole('heading', { name: 'Raffles pitcher plant' })).toBeVisible();
  });

  it('opens the record on this phone first when the plant info has the same tag', async () => {
    await savePlantInfo('staff');
    const app = await renderApp();
    scan('NNP-3F2A9C');
    expect(app.getPathname()).toBe(`/record/${BELIAN_ID}`);
    expect(screen.getByRole('heading', { name: 'Eusideroxylon zwageri' })).toBeVisible();
  });

  it('says so when neither the records nor the plant info have the tag', async () => {
    await savePlantInfo('staff');
    const app = await renderApp();
    scan('NNP-A1B2C3');
    const message = 'No record with tag NNP-A1B2C3 on this phone.';
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
    expect(app.getPathname()).toBe('/scan');
  });

  it("doesn't keep their scans in History", async () => {
    await savePlantInfo('staff');
    await renderApp();
    scan('NNP-E1A2B3');
    backToScan();
    fireEvent.changeText(tagCodeBox(), 'NNP-A1B2C3');
    fireEvent(tagCodeBox(), 'submitEditing');

    // Staff never see History, but it would list anything the phone kept.
    testRouter.navigate('/history');
    expect(await screen.findByText(NO_SCANS)).toBeVisible();
    expect(await savedScans()).toEqual([]);
  });
});

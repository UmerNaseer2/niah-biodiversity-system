import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { AccessibilityInfo, Text } from 'react-native';

import { VisitorHome } from '@/components/visitor/visitor-home';
import { VisitorSettings } from '@/components/visitor/visitor-settings';
import { SWITCH_FAILED } from '@/hooks/use-switch-mode';
import { formatRecordedAt } from '@/lib/format';
import { usePublicCopy } from '@/state/public-copy-context';
import { useRecords } from '@/state/records-context';
import type { DownloadOutcome } from '@/sync/public-copy';
import type { PublicRecord } from '@/types/public-copy';

// The Home and Settings tabs a visitor sees, with what the phone has saved and how the download is
// going swapped for stand-ins. When the plant info downloads is tested in
// src/state/__tests__/public-copy-context.test.tsx.

jest.mock('@/state/records-context', () => ({ useRecords: jest.fn() }));
jest.mock('@/state/public-copy-context', () => ({ usePublicCopy: jest.fn() }));

type CopyState = ReturnType<typeof usePublicCopy>;

const DOWNLOADED = '2026-11-04T06:15:00.000Z';
const GETTING_READY = 'Getting plant info ready for offline use...';
const NOT_SET_UP = "Downloading plant info isn't set up in this build.";
const NO_SIGNAL_YET =
  'No signal right now. The plant info will download once this phone is online.';
const FAILED_YET = "Couldn't download the plant info. Try again in a little while.";
const NO_SIGNAL_KEPT = 'No signal right now. The plant info saved on this phone still works.';

const updateNow = jest.fn(async () => {});
const setMode = jest.fn();

/** Made-up tagged plants. Like the real plant info, they have no location. */
function plants(count: number): PublicRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `plant-${index}`,
    tagCode: `NNP-00000${index}`,
    speciesName: 'Ficus sp.',
    recordedAt: '2026-10-20T02:30:00.000Z',
  }));
}

/** The tagged plants saved on the phone, and when they came down (null if they haven't yet). */
function setRecords(publicRecords: PublicRecord[], publicCopyAt: string | null) {
  jest.mocked(useRecords).mockReturnValue({ publicRecords, publicCopyAt, setMode } as never);
}

/** How the download is going. Leaving a field out means the last download worked. */
function setCopy(state: Partial<CopyState> = {}) {
  jest.mocked(usePublicCopy).mockReturnValue({
    updateNow,
    running: false,
    message: null,
    lastOutcome: 'done',
    canUpdate: true,
    ...state,
  });
}

function StandIn({ name }: { name: string }) {
  return <Text>{name}</Text>;
}

function TestLayout() {
  return <Stack />;
}

function renderTab(tab: 'home' | 'settings') {
  return renderRouter(
    {
      _layout: TestLayout,
      index: VisitorHome,
      settings: VisitorSettings,
      scan: () => <StandIn name="Scan page" />,
    },
    { initialUrl: tab === 'home' ? '/' : '/settings' },
  );
}

/** Presses a button and lets what it starts finish. */
async function press(name: string) {
  const button = await screen.findByRole('button', { name });
  await act(async () => {
    fireEvent.press(button);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  setMode.mockReset().mockResolvedValue(undefined);
  setRecords(plants(3), DOWNLOADED);
  setCopy();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('visitor Home', () => {
  it('shows how many tagged plants are ready offline, and when they last updated', async () => {
    renderTab('home');
    expect(await screen.findByLabelText('3 tagged plants ready offline')).toBeVisible();
    expect(screen.getByText('You can scan their tags with no signal.')).toBeVisible();
    expect(screen.getByText(formatRecordedAt(DOWNLOADED))).toBeVisible();
  });

  it('says tagged plant and not tagged plants when there is only one', async () => {
    setRecords(plants(1), DOWNLOADED);
    renderTab('home');
    expect(await screen.findByLabelText('1 tagged plant ready offline')).toBeVisible();
    expect(screen.getByText('tagged plant')).toBeVisible();
  });

  it("says the park hasn't tagged any plants yet when the plant info has none", async () => {
    setRecords([], DOWNLOADED);
    renderTab('home');
    expect(await screen.findByLabelText('0 tagged plants ready offline')).toBeVisible();
    expect(screen.getByText("The park hasn't added any tagged plants yet.")).toBeVisible();
    expect(screen.queryByText('You can scan their tags with no signal.')).toBeNull();
  });

  // A download only swaps the copy at the end, so the one already saved works the whole time.
  it('keeps showing the saved plant info while a new download runs', async () => {
    setCopy({ running: true });
    renderTab('home');
    expect(await screen.findByLabelText('3 tagged plants ready offline')).toBeVisible();
    expect(screen.queryByText(GETTING_READY)).toBeNull();
  });

  it.each<[string, Partial<CopyState>]>([
    ['before the first download starts', { lastOutcome: null }],
    ['while the first download runs', { running: true, lastOutcome: null }],
    ['while it tries again after one failed', { running: true, lastOutcome: 'failed' }],
  ])('says it is getting the plant info ready %s', async (_when, state) => {
    setRecords([], null);
    setCopy(state);
    renderTab('home');
    expect(await screen.findByText(GETTING_READY)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it.each<[string, DownloadOutcome, string]>([
    ['with no signal', 'offline', NO_SIGNAL_YET],
    ['with an error', 'failed', FAILED_YET],
  ])('explains a first download that ended %s, and tries again', async (_how, outcome, says) => {
    setRecords([], null);
    setCopy({ lastOutcome: outcome });
    renderTab('home');
    expect(await screen.findByText(says)).toBeVisible();
    expect(screen.queryByText(GETTING_READY)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(updateNow).toHaveBeenCalledTimes(1);
  });

  it("says downloading isn't set up in a build with no server settings", async () => {
    setRecords([], null);
    setCopy({ canUpdate: false, lastOutcome: null });
    renderTab('home');
    expect(await screen.findByText(NOT_SET_UP)).toBeVisible();
    expect(screen.queryByText(GETTING_READY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('opens the scanner from Scan a plant tag', async () => {
    const app = renderTab('home');
    fireEvent.press(await screen.findByRole('button', { name: 'Scan a plant tag' }));
    expect(await screen.findByText('Scan page')).toBeVisible();
    expect(app.getPathname()).toBe('/scan');
  });
});

describe('visitor Settings', () => {
  it('shows when the plant info last updated', async () => {
    renderTab('settings');
    expect(await screen.findByText(formatRecordedAt(DOWNLOADED))).toBeVisible();
    expect(screen.queryByText('Not yet')).toBeNull();
  });

  it('says Not yet before the first download', async () => {
    setRecords([], null);
    setCopy({ lastOutcome: null });
    renderTab('settings');
    expect(await screen.findByText('Not yet')).toBeVisible();
  });

  it('updates the plant info from Update now', async () => {
    renderTab('settings');
    fireEvent.press(await screen.findByRole('button', { name: 'Update now' }));
    expect(updateNow).toHaveBeenCalledTimes(1);
  });

  it('turns Update now off and says Updating... while a download runs', async () => {
    setCopy({ running: true });
    renderTab('settings');
    expect(await screen.findByRole('button', { name: 'Updating...' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
  });

  it('shows what the last Update now said', async () => {
    setCopy({ lastOutcome: 'offline', message: NO_SIGNAL_KEPT });
    renderTab('settings');
    expect(await screen.findByText(NO_SIGNAL_KEPT)).toBeVisible();
  });

  it('has no Update now in a build with no server settings', async () => {
    setRecords([], null);
    setCopy({ canUpdate: false, lastOutcome: null });
    renderTab('settings');
    expect(await screen.findByText(NOT_SET_UP)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
  });

  it('switches the phone to staff from I work at the park', async () => {
    renderTab('settings');
    await press('I work at the park');
    expect(setMode.mock.calls).toEqual([['staff']]);
    // The staff tabs take over once that's saved, so the button stays off until then.
    expect(screen.getByRole('button', { name: 'I work at the park' })).toBeDisabled();
  });

  it("says so when the switch can't be saved, and lets them try again", async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const failure = new Error('database or disk is full');
    setMode.mockRejectedValueOnce(failure);
    renderTab('settings');

    await press('I work at the park');
    expect(screen.getByRole('alert')).toHaveTextContent(SWITCH_FAILED);
    expect(announce).toHaveBeenCalledWith(SWITCH_FAILED);
    expect(console.warn).toHaveBeenCalledWith("Couldn't save who uses this phone.", failure);
    expect(screen.getByRole('button', { name: 'I work at the park' })).toBeEnabled();

    await press('I work at the park');
    expect(setMode.mock.calls).toEqual([['staff'], ['staff']]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the About card', async () => {
    renderTab('settings');
    expect(await screen.findByRole('heading', { name: 'About' })).toBeVisible();
    expect(screen.getByText('Niah Ground-Truthing')).toBeVisible();
  });
});

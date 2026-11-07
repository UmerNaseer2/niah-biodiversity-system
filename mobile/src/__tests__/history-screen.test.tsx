import { Stack, useLocalSearchParams } from 'expo-router';
import { act, fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { AccessibilityInfo, Text } from 'react-native';

import HistoryScreen from '@/app/(tabs)/history';
import { formatRecordedAt } from '@/lib/format';
import { matchesTag } from '@/lib/id';
import { useRecords } from '@/state/records-context';
import type { PublicRecord, PublicSpecies, ScanEntry } from '@/types/public-copy';

// The History tab on its own, with the scans and plant info on the phone swapped for made-up
// ones. Saving scans from the Scan tab, and clearing them from the real database, is tested in
// scan-plant-info.test.tsx.

jest.mock('@/state/records-context', () => ({ useRecords: jest.fn() }));

const CLEAR_ASK = 'This takes every scan off History on this phone. Clear it?';
const CLEAR_FAILED = "Couldn't clear the history. Try again.";
const NO_SCANS = 'No scans yet. Tags you scan show up here.';

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

// Not matched to a species yet, so all it has is the Latin name the field team wrote.
const FIG_PLANT: PublicRecord = {
  id: '9b8c7d6e-1f2a-4b3c-8d4e-5f6a7b8c9d02',
  tagCode: 'NNP-9B8C7D',
  speciesName: 'Ficus sp.',
  recordedAt: '2026-10-20T03:00:00.000Z',
};

const PLANTS = [PITCHER_PLANT, FIG_PLANT];

// Newest first, the way the phone keeps them. NNP-A1B2C3 isn't in the plant info yet.
const SCANS: ScanEntry[] = [
  { tagCode: 'NNP-E1A2B3', scannedAt: '2026-11-04T01:00:00.000Z' },
  { tagCode: 'NNP-A1B2C3', scannedAt: '2026-11-03T05:30:00.000Z' },
  { tagCode: 'NNP-9B8C7D', scannedAt: '2026-11-02T01:00:00.000Z' },
];

const clearScans = jest.fn<Promise<void>, []>();

/** The scans and plant info on the phone. */
function setScans(scans: ScanEntry[]) {
  jest.mocked(useRecords).mockReturnValue({
    scans,
    findPublicByTag: (input: string) => PLANTS.find((plant) => matchesTag(plant, input)),
    publicSpecies: [PITCHER],
    clearScans,
  } as never);
}

function StandIn({ name }: { name: string }) {
  return <Text>{name}</Text>;
}

function PlantStandIn() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  return <Text>Plant page for {tag}</Text>;
}

function TestLayout() {
  return <Stack />;
}

function renderHistory() {
  return renderRouter(
    {
      _layout: TestLayout,
      history: HistoryScreen,
      scan: () => <StandIn name="Scan page" />,
      'plant/[tag]': PlantStandIn,
    },
    { initialUrl: '/history' },
  );
}

async function press(name: string) {
  const button = await screen.findByRole('button', { name });
  await act(async () => {
    fireEvent.press(button);
  });
}

/** What each row reads out, top to bottom. */
function rowLabels() {
  return screen
    .queryAllByLabelText(/, (tag NNP-\w{6}|no plant info yet), /)
    .map((row) => row.props.accessibilityLabel ?? row.props['aria-label']);
}

/** When a scan happened, the way its row says it. */
function scannedAt(index: number) {
  return formatRecordedAt(SCANS[index].scannedAt);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  clearScans.mockReset().mockResolvedValue(undefined);
  setScans(SCANS);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('History', () => {
  it('lists the scanned tags newest first, named from the plant info', async () => {
    renderHistory();
    expect(await screen.findByRole('heading', { name: 'History' })).toBeVisible();
    expect(
      screen.getByText("The tags you scanned, newest first. They're only kept on this phone."),
    ).toBeVisible();
    expect(rowLabels()).toEqual([
      `Raffles pitcher plant, tag NNP-E1A2B3, ${scannedAt(0)}`,
      `Tag NNP-A1B2C3, no plant info yet, ${scannedAt(1)}`,
      `Ficus sp., tag NNP-9B8C7D, ${scannedAt(2)}`,
    ]);
    expect(screen.getByText(`NNP-E1A2B3 · ${scannedAt(0)}`)).toBeVisible();
    expect(screen.getByText(`No plant info yet · ${scannedAt(1)}`)).toBeVisible();
    expect(screen.getByText(`NNP-9B8C7D · ${scannedAt(2)}`)).toBeVisible();
  });

  it('puts a plant in italics when all it has is a Latin name', async () => {
    renderHistory();
    expect(await screen.findByText('Ficus sp.')).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText('Raffles pitcher plant')).not.toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText('Tag NNP-A1B2C3')).not.toHaveStyle({ fontStyle: 'italic' });
  });

  it("opens a scan's plant page, even for a tag with no plant info yet", async () => {
    const app = renderHistory();
    const pitcher = `Raffles pitcher plant, tag NNP-E1A2B3, ${scannedAt(0)}`;
    fireEvent.press(await screen.findByLabelText(pitcher));
    expect(await screen.findByText('Plant page for NNP-E1A2B3')).toBeVisible();
    expect(app.getPathname()).toBe('/plant/NNP-E1A2B3');

    testRouter.back('/history');
    fireEvent.press(screen.getByLabelText(`Tag NNP-A1B2C3, no plant info yet, ${scannedAt(1)}`));
    expect(await screen.findByText('Plant page for NNP-A1B2C3')).toBeVisible();
    expect(app.getPathname()).toBe('/plant/NNP-A1B2C3');
  });

  it('says there are no scans yet, with a way to the Scan tab', async () => {
    setScans([]);
    const app = renderHistory();
    expect(await screen.findByText(NO_SCANS)).toBeVisible();
    expect(rowLabels()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Clear history' })).toBeNull();

    await press('Scan a plant tag');
    expect(await screen.findByText('Scan page')).toBeVisible();
    expect(app.getPathname()).toBe('/scan');
  });
});

describe('Clear history', () => {
  it('asks first, and leaves the scans alone when you keep them', async () => {
    renderHistory();
    await press('Clear history');
    expect(screen.getByRole('alert', { name: CLEAR_ASK })).toBeVisible();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(CLEAR_ASK);
    expect(screen.queryByRole('button', { name: 'Clear history' })).toBeNull();

    await press('Keep it');
    expect(screen.getByRole('button', { name: 'Clear history' })).toBeVisible();
    expect(screen.queryByText(CLEAR_ASK)).toBeNull();
    expect(clearScans).not.toHaveBeenCalled();
    expect(rowLabels()).toHaveLength(3);
  });

  it('clears once and says so, even when Clear it is pressed twice quickly', async () => {
    renderHistory();
    await press('Clear history');
    const clearIt = screen.getByRole('button', { name: 'Clear it' });
    await act(async () => {
      fireEvent.press(clearIt);
      fireEvent.press(clearIt);
    });
    expect(clearScans).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('History cleared.');
  });

  it('turns both buttons off while it clears', async () => {
    clearScans.mockReturnValueOnce(new Promise(() => {}));
    renderHistory();
    await press('Clear history');
    await press('Clear it');
    expect(screen.getByRole('button', { name: 'Clearing...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeDisabled();
  });

  it("says when clearing didn't work, and lets you try again", async () => {
    const error = new Error('Disk is full');
    clearScans.mockRejectedValueOnce(error);
    renderHistory();
    await press('Clear history');
    await press('Clear it');
    expect(await screen.findByRole('alert', { name: CLEAR_FAILED })).toBeVisible();
    expect(console.warn).toHaveBeenCalledWith("Couldn't clear the history.", error);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(CLEAR_FAILED);
    expect(screen.getByRole('button', { name: 'Clear it' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeEnabled();

    await press('Clear it');
    expect(clearScans).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(CLEAR_FAILED)).toBeNull();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(
      'History cleared.',
    );
  });

  it('forgets a failed clear once you keep the scans', async () => {
    clearScans.mockRejectedValueOnce(new Error('Disk is full'));
    renderHistory();
    await press('Clear history');
    await press('Clear it');
    expect(await screen.findByRole('alert', { name: CLEAR_FAILED })).toBeVisible();

    await press('Keep it');
    await press('Clear history');
    expect(screen.getByRole('alert', { name: CLEAR_ASK })).toBeVisible();
    expect(screen.queryByText(CLEAR_FAILED)).toBeNull();
  });
});

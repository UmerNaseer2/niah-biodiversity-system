import { Stack, useLocalSearchParams } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { ALERTS_SHOWN, SensorAlertsCard } from '@/components/sensor-alerts-card';
import { formatRecordedAt, formatTime } from '@/lib/format';
import { ALERT_WORDS, type NearbyPlants } from '@/lib/sensor-alerts';
import { useSensorAlerts, type AlertsCheck } from '@/state/alerts-context';
import type { AlertWithPlants } from '@/sync/sensor-alerts';

// The alert card on an officer's Home tab, with the alerts swapped for stand-ins. When the phone
// checks is tested in src/state/__tests__/alerts-context.test.tsx.

jest.mock('@/state/alerts-context', () => ({ useSensorAlerts: jest.fn() }));

type AlertsState = ReturnType<typeof useSensorAlerts>;

const CHECKED = '2026-11-18T01:30:00.000Z';
const STARTED = '2026-11-18T01:00:00.000Z';
const THANKS = "Thanks. The website's Sensors page now shows someone is on it.";

const acknowledge = jest.fn(async (_id: number) => THANKS);

const PLANTS: NearbyPlants = {
  kind: 'found',
  plants: [
    {
      id: 'plant-1',
      tagCode: 'NNP-A00001',
      speciesName: 'Nepenthes rafflesiana',
      commonName: 'Raffles pitcher plant',
      distanceM: 15,
      waiting: false,
    },
    {
      id: 'plant-2',
      tagCode: 'NNP-A00002',
      speciesName: 'Ficus sp.',
      distanceM: 60,
      waiting: true,
    },
  ],
  maybeMore: false,
};

function alert(id: number, changes: Partial<AlertWithPlants> = {}): AlertWithPlants {
  return {
    id,
    nodeId: `node-0${id}`,
    nodeName: `Node ${id}`,
    type: 'SATURATED',
    severity: 'urgent',
    recordedAt: STARTED,
    nearby: { kind: 'no-position' },
    ...changes,
  };
}

/** What the phone knows about alerts. Leaving a field out means one check worked with none. */
function setAlerts(state: Partial<AlertsState> = {}) {
  const alerts = state.alerts ?? [];
  jest.mocked(useSensorAlerts).mockReturnValue({
    enabled: true,
    alerts,
    total: alerts.length,
    lastCheck: 'loaded',
    checkedAt: CHECKED,
    acknowledge,
    acknowledging: null,
    ...state,
  });
}

function TestLayout() {
  return <Stack />;
}

function PlantStandIn() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  return <Text>Plant page for {tag}</Text>;
}

function renderCard() {
  return renderRouter(
    { _layout: TestLayout, index: SensorAlertsCard, 'plant/[tag]': PlantStandIn },
    { initialUrl: '/' },
  );
}

/** "Started today, 9:00 am", worked out the same way as the card so it matches in any time zone. */
function started(verb = 'Started') {
  const day = formatRecordedAt(STARTED);
  return `${verb} ${day.charAt(0).toLowerCase()}${day.slice(1)}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  setAlerts();
});

describe('who sees the card', () => {
  it('shows for an officer once a check has worked', async () => {
    renderCard();
    expect(await screen.findByRole('heading', { name: 'Sensor alerts' })).toBeVisible();
    expect(screen.getByText('None need anyone right now.')).toBeVisible();
  });

  it('is left off for anyone who does not get alerts', () => {
    setAlerts({ enabled: false });
    renderCard();
    expect(screen.queryByText('Sensor alerts')).toBeNull();
  });

  it('is left off when the server will not let this account read alerts', () => {
    setAlerts({ lastCheck: 'not-allowed', checkedAt: null });
    renderCard();
    expect(screen.queryByText('Sensor alerts')).toBeNull();
  });
});

describe('before the first check works', () => {
  it.each<[AlertsCheck | null, string]>([
    [null, 'Checking for sensor alerts.'],
    [
      'offline',
      "No signal, so the phone can't check for sensor alerts. It tries again every minute.",
    ],
    ['failed', "Couldn't check for sensor alerts. The phone tries again every minute."],
  ])('says what is going on when the last check was %p', async (lastCheck, text) => {
    setAlerts({ lastCheck, checkedAt: null });
    renderCard();
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.queryByText('None need anyone right now.')).toBeNull();
  });
});

describe('when the alerts are from', () => {
  it.each<[AlertsCheck, string]>([
    ['loaded', 'Checked at TIME. The phone checks every minute while the app is open.'],
    ['offline', 'No signal. These are from TIME, and the phone tries again every minute.'],
    ['failed', "Couldn't check just now. These are from TIME, and the phone tries again soon."],
  ])('says so after a check that came back %s', async (lastCheck, text) => {
    setAlerts({ lastCheck, alerts: [alert(1)] });
    renderCard();
    expect(await screen.findByText(text.replace('TIME', formatTime(CHECKED)))).toBeVisible();
    // The alerts from the last check that worked stay on the card.
    expect(screen.getByText(ALERT_WORDS.SATURATED.title)).toBeVisible();
  });
});

describe('an alert', () => {
  it('says what it is, where, what it means and what to do', async () => {
    setAlerts({ alerts: [alert(1)] });
    renderCard();
    const words = ALERT_WORDS.SATURATED;
    expect(await screen.findByRole('heading', { name: words.title })).toBeVisible();
    expect(screen.getByText('Urgent')).toBeVisible();
    expect(screen.getByText(`Node 1 · ${started()}`)).toBeVisible();
    expect(screen.getByText(words.means)).toBeVisible();
    expect(screen.getByText('What to do')).toBeVisible();
    expect(screen.getByText(words.todo)).toBeVisible();
  });

  it('marks a routine alert as routine', async () => {
    setAlerts({ alerts: [alert(1, { type: 'RAIN', severity: 'routine' })] });
    renderCard();
    expect(await screen.findByText('Routine')).toBeVisible();
    expect(screen.queryByText('Urgent')).toBeNull();
  });

  it('gives the last reading time for a node that has gone quiet', async () => {
    setAlerts({ alerts: [alert(1, { type: 'QUIET', severity: 'routine' })] });
    renderCard();
    expect(await screen.findByText(`Node 1 · ${started('Last heard')}`)).toBeVisible();
  });

  it('lists the tagged plants near the node, nearest first', async () => {
    setAlerts({ alerts: [alert(1, { nearby: PLANTS })] });
    renderCard();
    expect(await screen.findByText('Tagged plants within 100 m')).toBeVisible();
    expect(
      screen.getByLabelText(
        'Tag NNP-A00001, Raffles pitcher plant, Nepenthes rafflesiana, 15 m away',
      ),
    ).toBeVisible();
    expect(
      screen.getByLabelText('Tag NNP-A00002, Ficus sp., 60 m away · waiting for review'),
    ).toBeVisible();
  });

  it('opens the plant page from a plant near the node', async () => {
    setAlerts({ alerts: [alert(1, { nearby: PLANTS })] });
    const app = renderCard();
    const row = await screen.findByLabelText(
      'Tag NNP-A00001, Raffles pitcher plant, Nepenthes rafflesiana, 15 m away',
    );
    await act(async () => {
      fireEvent.press(row);
    });
    expect(await screen.findByText('Plant page for NNP-A00001')).toBeVisible();
    expect(app.getPathname()).toBe('/plant/NNP-A00001');
  });

  it.each<[string, NearbyPlants, string]>([
    [
      'the node has no position',
      { kind: 'no-position' },
      "This node has no position saved, so the phone can't tell which plants are near it.",
    ],
    [
      'the plants near it could not be read',
      { kind: 'failed' },
      "Couldn't read the tagged plants near this node.",
    ],
    [
      'no tagged plants are near it',
      { kind: 'found', plants: [], maybeMore: false },
      'No tagged plants within 100 m of this node.',
    ],
  ])('says so when %s', async (_why, nearby, text) => {
    setAlerts({ alerts: [alert(1, { nearby })] });
    renderCard();
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.queryByText('Tagged plants within 100 m')).toBeNull();
  });

  it('says there may be nearer plants when the read hit its limit', async () => {
    setAlerts({ alerts: [alert(1, { nearby: { ...PLANTS, maybeMore: true } })] });
    renderCard();
    expect(
      await screen.findByText(
        'There are a lot of records around here, so there may be nearer plants. ' +
          "The website's Sensors page has the full list.",
      ),
    ).toBeVisible();
  });
});

describe('a lot of alerts', () => {
  it(`lists ${ALERTS_SHOWN} and sends people to the website for the rest`, async () => {
    setAlerts({ alerts: [alert(1), alert(2), alert(3), alert(4)], total: 6 });
    renderCard();
    expect(await screen.findAllByRole('button', { name: /^I'm on it/ })).toHaveLength(3);
    expect(screen.queryByText(/^Node 4 ·/)).toBeNull();
    expect(screen.getByText("3 more alerts on the website's Sensors page.")).toBeVisible();
  });

  it('says alert, not alerts, for one more', async () => {
    setAlerts({ alerts: [alert(1), alert(2), alert(3)], total: 4 });
    renderCard();
    expect(await screen.findByText("1 more alert on the website's Sensors page.")).toBeVisible();
  });

  it('leaves the line off when they all fit', async () => {
    setAlerts({ alerts: [alert(1), alert(2), alert(3)] });
    renderCard();
    await screen.findAllByRole('button', { name: /^I'm on it/ });
    expect(screen.queryByText(/more alerts? on the website/)).toBeNull();
  });
});

describe("I'm on it", () => {
  it('tells the server and shows how it went', async () => {
    setAlerts({ alerts: [alert(1), alert(2)] });
    renderCard();
    const button = await screen.findByRole('button', {
      name: `I'm on it: ${ALERT_WORDS.SATURATED.title} at Node 2`,
    });
    await act(async () => {
      fireEvent.press(button);
    });
    expect(acknowledge).toHaveBeenCalledWith(2);
    expect(await screen.findByText(THANKS)).toBeVisible();
  });

  it('waits while the server is being told', async () => {
    setAlerts({ alerts: [alert(1), alert(2)], acknowledging: 1 });
    renderCard();
    const busy = await screen.findByRole('button', {
      name: `I'm on it: ${ALERT_WORDS.SATURATED.title} at Node 1`,
    });
    expect(busy).toBeDisabled();
    expect(screen.getByText('Marking it')).toBeVisible();
    expect(
      screen.getByRole('button', { name: `I'm on it: ${ALERT_WORDS.SATURATED.title} at Node 2` }),
    ).toBeEnabled();
  });
});

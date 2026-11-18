import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, AppState, Vibration } from 'react-native';

import { getSupabase } from '@/lib/supabase';
import { useAccount } from '@/state/account-context';
import { CHECK_EVERY_MS, SensorAlertsProvider, useSensorAlerts } from '@/state/alerts-context';
import { useRecords } from '@/state/records-context';
import {
  acknowledgeSensorAlert,
  loadSensorAlerts,
  type AlertWithPlants,
  type LoadAlertsResult,
} from '@/sync/sensor-alerts';

// This file is about when the phone checks for alerts and what it tells people. What a check reads
// from the server is in src/sync/__tests__/sensor-alerts.test.ts.

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/state/account-context', () => ({ useAccount: jest.fn() }));
jest.mock('@/state/records-context', () => ({ useRecords: jest.fn() }));
jest.mock('@/sync/sensor-alerts', () => ({
  loadSensorAlerts: jest.fn(),
  acknowledgeSensorAlert: jest.fn(),
}));

function alert(id: number, severity: 'urgent' | 'routine' = 'urgent'): AlertWithPlants {
  return {
    id,
    nodeId: `node-0${id}`,
    nodeName: `Node ${id}`,
    type: severity === 'urgent' ? 'SATURATED' : 'RAIN',
    severity,
    recordedAt: '2026-11-18T01:00:00Z',
    nearby: { kind: 'no-position' },
  };
}

function loaded(alerts: AlertWithPlants[], total = alerts.length): LoadAlertsResult {
  return { kind: 'loaded', alerts, total };
}

type Who = {
  mode?: 'staff' | 'visitor';
  status?: 'signed-in' | 'signed-out' | 'loading';
  role?: string | null;
  userId?: string;
};

function setWho({
  mode = 'staff',
  status = 'signed-in',
  role = 'conservation_officer',
  userId = 'officer-1',
}: Who = {}) {
  jest.mocked(useRecords).mockReturnValue({ mode } as never);
  jest.mocked(useAccount).mockReturnValue({
    status,
    account: status === 'signed-in' ? { userId, role } : null,
  } as never);
}

/** A check that only finishes when the test says so. */
function slowCheck() {
  let finish: (result: LoadAlertsResult) => void = () => {};
  jest.mocked(loadSensorAlerts).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  return (result: LoadAlertsResult) => finish(result);
}

let appStateListener: (state: string) => void;
const realCurrentState = Object.getOwnPropertyDescriptor(AppState, 'currentState');

/** The jest set-up makes currentState a function, so the test sets it by hand. */
function setAppState(state: 'active' | 'background') {
  Object.defineProperty(AppState, 'currentState', {
    value: state,
    configurable: true,
    writable: true,
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return <SensorAlertsProvider>{children}</SensorAlertsProvider>;
}

async function renderAlerts() {
  const hook = renderHook(() => useSensorAlerts(), { wrapper });
  await settle();
  return hook;
}

async function settle(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

const checks = () => jest.mocked(loadSensorAlerts).mock.calls.length;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  setWho();
  jest.mocked(getSupabase).mockReturnValue({} as never);
  jest.mocked(loadSensorAlerts).mockResolvedValue(loaded([]));
  jest.mocked(acknowledgeSensorAlert).mockResolvedValue('done');
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  setAppState('active');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as typeof appStateListener;
    return { remove: jest.fn() } as never;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (realCurrentState) {
    Object.defineProperty(AppState, 'currentState', realCurrentState);
  }
});

describe('who gets alerts', () => {
  it.each(['conservation_officer', 'admin'])('checks for a signed in %s', async (role) => {
    setWho({ role });
    const { result } = await renderAlerts();
    expect(result.current.enabled).toBe(true);
    expect(checks()).toBe(1);
  });

  it.each<[string, Who]>([
    ['a botanist', { role: 'botanist' }],
    ['an account whose role has not been read yet', { role: null }],
    ['a phone in visitor mode', { mode: 'visitor' }],
    ['nobody signed in', { status: 'signed-out' }],
    ['a phone still working out who is signed in', { status: 'loading' }],
  ])('never checks for %s', async (_why, who) => {
    setWho(who);
    const { result } = await renderAlerts();
    await settle(10 * CHECK_EVERY_MS);
    expect(result.current.enabled).toBe(false);
    expect(checks()).toBe(0);
  });

  it('never checks in a build with no server settings', async () => {
    jest.mocked(getSupabase).mockReturnValue(null);
    const { result } = await renderAlerts();
    await settle(10 * CHECK_EVERY_MS);
    expect(result.current.enabled).toBe(false);
    expect(checks()).toBe(0);
  });
});

describe('when the phone checks', () => {
  it('checks every minute while the app is open', async () => {
    await renderAlerts();
    expect(checks()).toBe(1);
    await settle(CHECK_EVERY_MS);
    expect(checks()).toBe(2);
    await settle(3 * CHECK_EVERY_MS);
    expect(checks()).toBe(5);
  });

  it('does not check in the background, then checks when the app comes back', async () => {
    await renderAlerts();
    setAppState('background');
    await settle(5 * CHECK_EVERY_MS);
    expect(checks()).toBe(1);

    setAppState('active');
    await act(async () => appStateListener('active'));
    await settle();
    expect(checks()).toBe(2);
  });

  it('only runs one check at a time, then goes round again if one was asked for', async () => {
    const finish = slowCheck();
    await renderAlerts();
    expect(checks()).toBe(1);
    // Another minute goes by and the app comes back to the front while the first is still going.
    await settle(CHECK_EVERY_MS);
    await act(async () => appStateListener('active'));
    expect(checks()).toBe(1);

    await act(async () => finish(loaded([alert(1)])));
    await settle();
    expect(checks()).toBe(2);
    await settle();
    expect(checks()).toBe(2);
  });

  it('starts again for the next person who signs in', async () => {
    const { rerender } = await renderAlerts();
    setWho({ userId: 'officer-2' });
    rerender({});
    await settle();
    expect(checks()).toBe(2);
  });
});

describe('what the phone shows', () => {
  it('has nothing before the first check finishes', async () => {
    slowCheck();
    const { result } = await renderAlerts();
    expect(result.current).toMatchObject({
      alerts: [],
      total: 0,
      lastCheck: null,
      checkedAt: null,
      acknowledging: null,
    });
  });

  it('shows the alerts from a check, with when it was', async () => {
    jest.setSystemTime(new Date('2026-11-18T02:00:00Z'));
    jest.mocked(loadSensorAlerts).mockResolvedValue(loaded([alert(1), alert(2, 'routine')], 7));
    const { result } = await renderAlerts();
    expect(result.current.alerts.map((one) => one.id)).toEqual([1, 2]);
    expect(result.current.total).toBe(7);
    expect(result.current.lastCheck).toBe('loaded');
    expect(result.current.checkedAt).toBe('2026-11-18T02:00:00.000Z');
  });

  it.each(['offline', 'failed'] as const)(
    'keeps the alerts from the last check after one that comes back %s',
    async (kind) => {
      jest.setSystemTime(new Date('2026-11-18T02:00:00Z'));
      jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1)]));
      const { result } = await renderAlerts();
      jest.mocked(loadSensorAlerts).mockResolvedValue({ kind });
      await settle(CHECK_EVERY_MS);
      expect(result.current.lastCheck).toBe(kind);
      expect(result.current.alerts.map((one) => one.id)).toEqual([1]);
      expect(result.current.checkedAt).toBe('2026-11-18T02:00:00.000Z');
    },
  );

  it('says when the server will not let this account read alerts', async () => {
    jest.mocked(loadSensorAlerts).mockResolvedValue({ kind: 'not-allowed' });
    const { result } = await renderAlerts();
    expect(result.current.lastCheck).toBe('not-allowed');
  });

  it('buzzes and reads out each new urgent alert once', async () => {
    jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1), alert(2, 'routine')]));
    await renderAlerts();
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Urgent sensor alert. Soil is saturated at Node 1.',
    );

    // The same alerts again, then a new routine one, are nothing new.
    jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1), alert(2, 'routine')]));
    await settle(CHECK_EVERY_MS);
    jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1), alert(3, 'routine')]));
    await settle(CHECK_EVERY_MS);
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);

    jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1), alert(4), alert(5)]));
    await settle(CHECK_EVERY_MS);
    expect(Vibration.vibrate).toHaveBeenCalledTimes(2);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(
      "2 urgent sensor alerts. They're at the top of the Home tab.",
    );
  });

  it('throws away a check that was still going when the person signed out', async () => {
    const finish = slowCheck();
    const { result, rerender } = await renderAlerts();
    setWho({ status: 'signed-out' });
    rerender({});
    await act(async () => finish(loaded([alert(1)])));
    await settle();
    expect(result.current.enabled).toBe(false);
    expect(result.current.alerts).toEqual([]);
    expect(Vibration.vibrate).not.toHaveBeenCalled();
  });

  it('shows nothing from one person to the next', async () => {
    jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1)]));
    const { result, rerender } = await renderAlerts();
    expect(result.current.alerts).toHaveLength(1);

    slowCheck();
    setWho({ userId: 'officer-2' });
    rerender({});
    await settle();
    expect(result.current).toMatchObject({
      alerts: [],
      total: 0,
      lastCheck: null,
      checkedAt: null,
    });
  });
});

describe("I'm on it", () => {
  it('tells the server, takes the alert off, and checks again', async () => {
    jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1), alert(2)], 5));
    const { result } = await renderAlerts();
    jest.mocked(loadSensorAlerts).mockClear();
    const finish = slowCheck();

    let message = '';
    await act(async () => {
      message = await result.current.acknowledge(1);
    });
    expect(acknowledgeSensorAlert).toHaveBeenCalledWith(expect.anything(), 1);
    expect(message).toBe("Thanks. The website's Sensors page now shows someone is on it.");
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(message);
    expect(result.current.alerts.map((one) => one.id)).toEqual([2]);
    expect(result.current.total).toBe(4);
    expect(result.current.acknowledging).toBeNull();
    expect(checks()).toBe(1);
    await act(async () => finish(loaded([alert(2)], 4)));
  });

  it('marks which alert is waiting on the server', async () => {
    jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1)]));
    const { result } = await renderAlerts();
    let answer: (outcome: 'done') => void = () => {};
    jest.mocked(acknowledgeSensorAlert).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    let pending: Promise<string> = Promise.resolve('');
    act(() => {
      pending = result.current.acknowledge(1);
    });
    expect(result.current.acknowledging).toBe(1);
    await act(async () => {
      answer('done');
      await pending;
    });
    expect(result.current.acknowledging).toBeNull();
  });

  it.each([
    ['offline', "No signal, so nobody knows you're on it yet. Try again once you have signal."],
    ['not-allowed', "This account can't mark alerts. Ask an admin to check your role."],
    ['failed', "Couldn't mark the alert. Try again in a little while."],
  ] as const)('keeps the alert when it comes back %s', async (outcome, text) => {
    jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1)]));
    const { result } = await renderAlerts();
    jest.mocked(acknowledgeSensorAlert).mockResolvedValue(outcome);
    let message = '';
    await act(async () => {
      message = await result.current.acknowledge(1);
    });
    expect(message).toBe(text);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(text);
    expect(result.current.alerts.map((one) => one.id)).toEqual([1]);
    expect(result.current.total).toBe(1);
    expect(checks()).toBe(1);
  });

  it('goes round again when the alert is marked during a check', async () => {
    jest.mocked(loadSensorAlerts).mockResolvedValueOnce(loaded([alert(1)]));
    const { result } = await renderAlerts();
    // This check may have read the alert before it was marked, so it can't be the last one.
    const finish = slowCheck();
    await settle(CHECK_EVERY_MS);
    expect(checks()).toBe(2);
    await act(async () => {
      await result.current.acknowledge(1);
    });
    expect(checks()).toBe(2);
    await act(async () => finish(loaded([alert(1)])));
    await settle();
    expect(checks()).toBe(3);
    expect(result.current.alerts).toEqual([]);
  });
});

it('says so when used outside the provider', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => renderHook(() => useSensorAlerts())).toThrow(
    'useSensorAlerts has to be used inside SensorAlertsProvider.',
  );
});

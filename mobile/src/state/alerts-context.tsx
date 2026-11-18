import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Vibration } from 'react-native';

import { announce } from '@/lib/announce';
import { canSeeAlerts, newUrgentAlerts, urgentAnnouncement } from '@/lib/sensor-alerts';
import { getSupabase } from '@/lib/supabase';
import { useAccount } from '@/state/account-context';
import { useRecords } from '@/state/records-context';
import {
  acknowledgeSensorAlert,
  loadSensorAlerts,
  type AcknowledgeOutcome,
  type AlertWithPlants,
  type LoadAlertsResult,
} from '@/sync/sensor-alerts';

// Tells field officers about sensor alerts on their phone (src/sync/sensor-alerts.ts reads them).
// It checks once a minute while the app is open and again when it comes back to the front, and a
// new urgent alert makes the phone buzz and gets read out. Nothing comes through while the app is
// closed, because that needs push notifications, which docs/innovation/improved-workflow.md lists
// as still to do. Only officers and admins can read alerts on the server, so only they check.

/** How often to check while the app is open. */
export const CHECK_EVERY_MS = 60 * 1000;

export type AlertsCheck = LoadAlertsResult['kind'];

type SensorAlertsContextValue = {
  /** True when this phone checks for alerts: an officer or admin, signed in, in staff mode. */
  enabled: boolean;
  /** The alerts from the last check that worked, urgent ones first. */
  alerts: AlertWithPlants[];
  /** How many alerts need someone, which can be more than the phone has in alerts. */
  total: number;
  /** How the last check went, or null before the first one finishes. */
  lastCheck: AlertsCheck | null;
  /** When the alerts were last read from the server, or null if they haven't been yet. */
  checkedAt: string | null;
  /** Tells the server someone is on this alert, then says how it went. */
  acknowledge: (id: number) => Promise<string>;
  /** The alert being marked right now, so its button can wait. */
  acknowledging: number | null;
};

const SensorAlertsContext = createContext<SensorAlertsContextValue | null>(null);

/** What to tell someone after they tap I'm on it. */
export function acknowledgeMessage(outcome: AcknowledgeOutcome) {
  switch (outcome) {
    case 'done':
      return "Thanks. The website's Sensors page now shows someone is on it.";
    case 'offline':
      return "No signal, so nobody knows you're on it yet. Try again once you have signal.";
    case 'not-allowed':
      return "This account can't mark alerts. Ask an admin to check your role.";
    case 'failed':
      return "Couldn't mark the alert. Try again in a little while.";
  }
}

export function SensorAlertsProvider({ children }: { children: ReactNode }) {
  const { mode } = useRecords();
  const { status, account } = useAccount();
  const enabled =
    mode === 'staff' &&
    status === 'signed-in' &&
    canSeeAlerts(account?.role ?? null) &&
    getSupabase() !== null;
  const who = enabled ? (account?.userId ?? null) : null;

  const [alerts, setAlerts] = useState<AlertWithPlants[]>([]);
  const [total, setTotal] = useState(0);
  const [lastCheck, setLastCheck] = useState<AlertsCheck | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<number | null>(null);

  // Nothing from one person's checks is shown to the next person who signs in on the phone.
  const [shownFor, setShownFor] = useState(who);
  if (shownFor !== who) {
    setShownFor(who);
    setAlerts([]);
    setTotal(0);
    setLastCheck(null);
    setCheckedAt(null);
  }

  // Goes up whenever the person changes, so a check that started before then is thrown away.
  const generation = useRef(0);
  // One check at a time. Patchy signal can make one take a while, and the next minute can come.
  const busy = useRef(false);
  // Something asked for a check during one, like I'm on it, so go round again once it's done.
  // The one already going may have read the alert before it was marked.
  const again = useRef(false);
  // The alerts the phone has already buzzed for, so each one only buzzes once.
  const seen = useRef(new Set<number>());

  async function check() {
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    again.current = false;
    const started = generation.current;
    try {
      const result = await loadSensorAlerts(supabase);
      if (generation.current !== started) {
        return;
      }
      setLastCheck(result.kind);
      // With no signal or an error, the alerts from the last check stay on screen with its time.
      if (result.kind !== 'loaded') {
        return;
      }
      setAlerts(result.alerts);
      setTotal(result.total);
      setCheckedAt(new Date().toISOString());
      const fresh = newUrgentAlerts(result.alerts, seen.current);
      for (const alert of result.alerts) {
        seen.current.add(alert.id);
      }
      if (fresh.length > 0) {
        Vibration.vibrate();
        announce(urgentAnnouncement(fresh));
      }
    } finally {
      busy.current = false;
      if (again.current && generation.current === started) {
        again.current = false;
        setTimeout(() => checkRef.current(), 0);
      }
    }
  }

  // The timer and listener below stay the same while checks are on, so they call whichever
  // version of check came from the latest render.
  const checkRef = useRef(check);
  useEffect(() => {
    checkRef.current = check;
  });

  useEffect(() => {
    generation.current += 1;
    seen.current = new Set();
    if (who === null) {
      return;
    }
    checkRef.current();
    const timer = setInterval(() => {
      // A phone in a pocket with the app in the background doesn't need to keep asking.
      if (AppState.currentState === 'active') {
        checkRef.current();
      }
    }, CHECK_EVERY_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkRef.current();
      }
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [who]);

  async function acknowledge(id: number) {
    const supabase = getSupabase();
    if (!supabase) {
      return acknowledgeMessage('failed');
    }
    setAcknowledging(id);
    const started = generation.current;
    let outcome: AcknowledgeOutcome;
    try {
      outcome = await acknowledgeSensorAlert(supabase, id);
    } finally {
      setAcknowledging(null);
    }
    if (outcome === 'done' && generation.current === started) {
      setAlerts((current) => current.filter((alert) => alert.id !== id));
      setTotal((current) => Math.max(0, current - 1));
      checkRef.current();
    }
    const text = acknowledgeMessage(outcome);
    announce(text);
    return text;
  }

  return (
    <SensorAlertsContext
      value={{
        enabled,
        alerts,
        total,
        lastCheck,
        checkedAt,
        acknowledge,
        acknowledging,
      }}>
      {children}
    </SensorAlertsContext>
  );
}

export function useSensorAlerts() {
  const value = use(SensorAlertsContext);
  if (!value) {
    throw new Error('useSensorAlerts has to be used inside SensorAlertsProvider.');
  }
  return value;
}

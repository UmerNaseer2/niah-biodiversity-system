import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Pill } from '@/components/ui/pill';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRecordedAt, formatTime, plural } from '@/lib/format';
import {
  ALERT_WORDS,
  NEARBY_RADIUS_M,
  type NearbyPlant,
  type NearbyPlants,
} from '@/lib/sensor-alerts';
import { useSensorAlerts } from '@/state/alerts-context';
import type { AlertWithPlants } from '@/sync/sensor-alerts';

/** How many alerts the card lists. The rest are on the website's Sensors page. */
export const ALERTS_SHOWN = 3;

/**
 * The sensor alerts that need someone, at the top of an officer's Home tab. Each one says what it
 * means, what to do, and which tagged plants are near the node. It's left off for anyone who
 * can't read alerts on the server.
 */
export function SensorAlertsCard() {
  const { enabled, alerts, total, lastCheck, checkedAt, acknowledge, acknowledging } =
    useSensorAlerts();
  const [notice, setNotice] = useState<string | null>(null);

  if (!enabled || lastCheck === 'not-allowed') {
    return null;
  }

  async function onAcknowledge(id: number) {
    setNotice(await acknowledge(id));
  }

  const shown = alerts.slice(0, ALERTS_SHOWN);
  const more = Math.max(0, total - shown.length);

  return (
    <Card title="Sensor alerts" icon="warning">
      {checkedAt === null ? (
        <ThemedText themeColor="textSecondary">{firstCheckText(lastCheck)}</ThemedText>
      ) : (
        <>
          {shown.length === 0 ? <ThemedText>None need anyone right now.</ThemedText> : null}
          {shown.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              busy={acknowledging === alert.id}
              onAcknowledge={() => onAcknowledge(alert.id)}
            />
          ))}
          {more > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {`${plural(more, 'more alert')} on the website's Sensors page.`}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {checkedText(lastCheck, checkedAt)}
          </ThemedText>
        </>
      )}
      {notice ? (
        <View aria-live="polite">
          <ThemedText type="small">{notice}</ThemedText>
        </View>
      ) : null}
    </Card>
  );
}

/** What the card says before the first check that worked. */
function firstCheckText(lastCheck: string | null) {
  switch (lastCheck) {
    case 'offline':
      return "No signal, so the phone can't check for sensor alerts. It tries again every minute.";
    case 'failed':
      return "Couldn't check for sensor alerts. The phone tries again every minute.";
    default:
      return 'Checking for sensor alerts.';
  }
}

/** When the alerts on the card were read, and whether the last check worked. */
function checkedText(lastCheck: string | null, checkedAt: string) {
  const time = formatTime(checkedAt);
  switch (lastCheck) {
    case 'offline':
      return `No signal. These are from ${time}, and the phone tries again every minute.`;
    case 'failed':
      return `Couldn't check just now. These are from ${time}, and the phone tries again soon.`;
    default:
      return `Checked at ${time}. The phone checks every minute while the app is open.`;
  }
}

function AlertItem({
  alert,
  busy,
  onAcknowledge,
}: {
  alert: AlertWithPlants;
  busy: boolean;
  onAcknowledge: () => void;
}) {
  const theme = useTheme();
  const words = ALERT_WORDS[alert.type];
  const urgent = alert.severity === 'urgent';
  // For a node that has gone quiet the time is its last reading, not when the alert started.
  const verb = alert.type === 'QUIET' ? 'Last heard' : 'Started';
  const day = formatRecordedAt(alert.recordedAt);
  const when = `${verb} ${day.charAt(0).toLowerCase()}${day.slice(1)}`;

  return (
    <View
      style={[
        styles.alert,
        {
          backgroundColor: theme.background,
          borderColor: urgent ? theme.danger : theme.border,
        },
      ]}>
      <Pill
        tone={urgent ? 'danger' : 'warning'}
        label={urgent ? 'Urgent' : 'Routine'}
        icon="warning"
      />
      <View style={styles.titleBlock}>
        <ThemedText type="heading" role="heading">
          {words.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {`${alert.nodeName} · ${when}`}
        </ThemedText>
      </View>
      <ThemedText>{words.means}</ThemedText>
      <View style={styles.titleBlock}>
        <ThemedText type="smallBold">What to do</ThemedText>
        <ThemedText>{words.todo}</ThemedText>
      </View>
      <NearbyList nearby={alert.nearby} />
      <Button
        label={busy ? 'Marking it' : "I'm on it"}
        variant="secondary"
        disabled={busy}
        aria-label={`I'm on it: ${words.title} at ${alert.nodeName}`}
        onPress={onAcknowledge}
      />
    </View>
  );
}

function NearbyList({ nearby }: { nearby: NearbyPlants }) {
  if (nearby.kind === 'no-position') {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {"This node has no position saved, so the phone can't tell which plants are near it."}
      </ThemedText>
    );
  }
  if (nearby.kind === 'failed') {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {"Couldn't read the tagged plants near this node."}
      </ThemedText>
    );
  }
  if (nearby.plants.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {`No tagged plants within ${NEARBY_RADIUS_M} m of this node.`}
      </ThemedText>
    );
  }
  return (
    <View style={styles.nearby}>
      <ThemedText type="overline" themeColor="textSecondary">
        {`Tagged plants within ${NEARBY_RADIUS_M} m`}
      </ThemedText>
      {nearby.plants.map((plant) => (
        <NearbyRow key={plant.id} plant={plant} />
      ))}
      {nearby.maybeMore ? (
        <ThemedText type="small" themeColor="textSecondary">
          {'There are a lot of records around here, so there may be nearer plants. ' +
            "The website's Sensors page has the full list."}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A plant near the node. It opens the plant page, where staff can add a visit. */
function NearbyRow({ plant }: { plant: NearbyPlant }) {
  const theme = useTheme();
  const name = plant.commonName ? `${plant.commonName}, ${plant.speciesName}` : plant.speciesName;
  const parts = [`${plant.distanceM} m away`, plant.waiting ? 'waiting for review' : undefined]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link href={{ pathname: '/plant/[tag]', params: { tag: plant.tagCode } }} asChild>
      <Pressable aria-label={`Tag ${plant.tagCode}, ${name}, ${parts}`} style={styles.pressable}>
        {({ pressed }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <View style={styles.rowBody}>
              <ThemedText style={styles.code}>{plant.tagCode}</ThemedText>
              <ThemedText type="small">{name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {parts}
              </ThemedText>
            </View>
            <Icon name="chevron" size={16} color={theme.textSecondary} />
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  alert: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  titleBlock: {
    gap: 2,
  },
  nearby: {
    gap: Spacing.two,
  },
  pressable: {
    borderRadius: Radius.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    padding: 12,
    borderRadius: Radius.md,
  },
  pressed: {
    opacity: 0.8,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: 700,
  },
});

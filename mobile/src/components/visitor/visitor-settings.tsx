import { AboutCard } from '@/components/about-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoRow } from '@/components/ui/info-row';
import { useNow } from '@/hooks/use-now';
import { useSwitchMode } from '@/hooks/use-switch-mode';
import { formatRecordedAt } from '@/lib/format';
import { usePublicCopy } from '@/state/public-copy-context';
import { useRecords } from '@/state/records-context';

/**
 * The Settings tab for visitors. It sits where staff have their profile, since visitors have no
 * account.
 */
export function VisitorSettings() {
  const { switchTo, switching, error } = useSwitchMode();

  return (
    <Screen title="Settings">
      <PlantInfoCard />

      <Card title="Work at the park?" icon="staff">
        <ThemedText type="small" themeColor="textSecondary">
          Staff can record plants and send them to the team. You&apos;ll sign in with your staff
          account.
        </ThemedText>
        {error ? (
          <ThemedText type="small" themeColor="danger" role="alert">
            {error}
          </ThemedText>
        ) : null}
        <Button
          label="I work at the park"
          icon="staff"
          variant="outline"
          disabled={switching}
          onPress={() => switchTo('staff')}
        />
      </Card>

      <AboutCard />
    </Screen>
  );
}

/** When the plant info for scanning with no signal last came down, and a button to update it. */
function PlantInfoCard() {
  const { publicCopyAt } = useRecords();
  const { updateNow, running, message, canUpdate } = usePublicCopy();
  const now = useNow();

  return (
    <Card title="Plant info" icon="leaf">
      <ThemedText type="small" themeColor="textSecondary">
        Plant info is saved on this phone, so you can scan tags with no signal. It updates by itself
        while the app is open and the phone is online.
      </ThemedText>
      <InfoRow
        label="Last updated"
        value={publicCopyAt ? formatRecordedAt(publicCopyAt, now) : 'Not yet'}
      />
      {message ? (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      ) : null}
      {canUpdate ? (
        <Button
          label={running ? 'Updating...' : 'Update now'}
          icon="sync"
          variant="outline"
          disabled={running}
          onPress={updateNow}
        />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Downloading plant info isn&apos;t set up in this build.
        </ThemedText>
      )}
    </Card>
  );
}

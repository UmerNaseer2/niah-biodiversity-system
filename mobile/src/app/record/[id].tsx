import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LocationSummary } from '@/components/location-summary';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoRow } from '@/components/ui/info-row';
import { PlaceholderNote } from '@/components/ui/placeholder-note';
import { SyncTag } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
import { announce } from '@/lib/announce';
import { conditionLabel, formatHeight, formatRecordedAt } from '@/lib/format';
import { useRecords } from '@/state/records-context';
import { uploadProblemMessage } from '@/sync/upload-row';

const REMOVE_ASK =
  "The server doesn't have this record any more, so once it's off this phone it's gone for " +
  'good. Remove it?';
const REMOVE_FAILED = "Couldn't remove the record from this phone. Try again.";
const RENEW_ASK =
  'This gives the record a new tag code. If you already put the old tag on the plant, it has to ' +
  'be swapped for the new one. Get a new tag?';
const RENEW_FAILED = "Couldn't change the tag code. Try again.";

/**
 * Takes a record an officer deleted on the website off the phone. It asks first, because the
 * server doesn't have the record either, so after this it's gone for good.
 */
function RemoveDeleted({ id }: { id: string }) {
  const router = useRouter();
  const { removeDeleted } = useRecords();
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Two quick taps can both land before the button shows as disabled. The second would find the
  // record already gone and say removing it failed.
  const busy = useRef(false);

  function ask() {
    setAsking(true);
    // The button that had focus is gone now, so nothing else would say the question appeared.
    announce(REMOVE_ASK);
  }

  function keep() {
    setAsking(false);
    setFailed(false);
  }

  async function remove() {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setRemoving(true);
    setFailed(false);
    try {
      await removeDeleted(id);
      router.dismissTo('/records');
    } catch (error) {
      console.warn("Couldn't remove the record.", error);
      busy.current = false;
      setFailed(true);
      setRemoving(false);
      announce(REMOVE_FAILED);
    }
  }

  if (!asking) {
    return <Button label="Remove from this phone" variant="outline" onPress={ask} />;
  }

  return (
    <View style={styles.ask}>
      <ThemedText type="smallBold" role="alert">
        {REMOVE_ASK}
      </ThemedText>
      <Button label="Remove it" onPress={remove} disabled={removing} />
      <Button label="Keep it" variant="outline" onPress={keep} disabled={removing} />
      {failed ? (
        <ThemedText type="small" themeColor="danger" role="alert">
          {REMOVE_FAILED}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * Gives a record whose tag code is already taken on the server a new one. The tag code comes from
 * the record's ID, so the ID changes as well, and this asks first in case the old tag is on a plant.
 */
function RenewTag({ id }: { id: string }) {
  const router = useRouter();
  const { renewTag } = useRecords();
  const [asking, setAsking] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  function ask() {
    setAsking(true);
    announce(RENEW_ASK);
  }

  async function renew() {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setRenewing(true);
    setFailed(false);
    try {
      const newId = await renewTag(id);
      router.replace({ pathname: '/record/[id]', params: { id: newId } });
    } catch (error) {
      console.warn("Couldn't change the tag code.", error);
      busy.current = false;
      setFailed(true);
      setRenewing(false);
      announce(RENEW_FAILED);
    }
  }

  if (!asking) {
    return <Button label="Get a new tag" variant="outline" onPress={ask} />;
  }

  return (
    <View style={styles.ask}>
      <ThemedText type="smallBold" role="alert">
        {RENEW_ASK}
      </ThemedText>
      <Button label="Get a new tag" onPress={renew} disabled={renewing} />
      <Button
        label="Not now"
        variant="outline"
        onPress={() => setAsking(false)}
        disabled={renewing}
      />
      {failed ? (
        <ThemedText type="small" themeColor="danger" role="alert">
          {RENEW_FAILED}
        </ThemedText>
      ) : null}
    </View>
  );
}

export default function RecordScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecord } = useRecords();
  const record = getRecord(id);

  if (!record) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Not found' }} />
        <Card title="Record not found" icon="warning">
          <ThemedText themeColor="textSecondary">
            It may have been made on another phone, or the link is wrong.
          </ThemedText>
          {/* dismissTo goes back to the tabs that are already open. navigate would stack a
              second copy of them on top of this screen. */}
          <Button
            label="Go to my records"
            variant="outline"
            onPress={() => router.dismissTo('/records')}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="overline" themeColor="primary">
          Tag {record.tagCode}
        </ThemedText>
        <ThemedText type="title" role="heading" style={styles.species}>
          {record.speciesName}
        </ThemedText>
        {record.commonName ? (
          <ThemedText type="subtitle" themeColor="textSecondary">
            {record.commonName}
          </ThemedText>
        ) : null}
        <View style={styles.tag}>
          <SyncTag
            status={record.syncStatus}
            problem={record.uploadProblem}
            review={record.reviewStatus}
          />
        </View>
      </View>

      {record.uploadProblem ? (
        <Card title="Couldn't upload" icon="warning">
          <ThemedText>{uploadProblemMessage(record.uploadProblem)}</ThemedText>
          {record.uploadProblem === 'deleted' ? <RemoveDeleted id={record.id} /> : null}
          {record.uploadProblem === 'tag-clash' ? <RenewTag id={record.id} /> : null}
        </Card>
      ) : null}

      {record.syncStatus === 'synced' && record.reviewStatus === 'rejected' ? (
        <Card title="Rejected by an officer" icon="warning">
          {record.reviewNotes ? <ThemedText>{record.reviewNotes}</ThemedText> : null}
          <ThemedText type="small" themeColor="textSecondary">
            It won&apos;t go on the public site. The app can&apos;t change a record once it&apos;s
            uploaded, so ask an officer to fix it on the website, or make a new record.
          </ThemedText>
        </Card>
      ) : null}

      <Card title="Details" icon="ruler">
        <InfoRow label="Height" value={formatHeight(record.heightM)} />
        <InfoRow label="Condition" value={conditionLabel(record.condition)} />
        <InfoRow label="Recorded" value={formatRecordedAt(record.recordedAt)} />
        <InfoRow label="Photos" value={String(record.photoCount)} />
      </Card>

      <Card title="Location" icon="pin">
        {record.location ? (
          <LocationSummary location={record.location} />
        ) : (
          <ThemedText themeColor="textSecondary">No location saved with this record.</ThemedText>
        )}
      </Card>

      {record.notes ? (
        <Card title="Notes" icon="notes">
          <ThemedText>{record.notes}</ThemedText>
        </Card>
      ) : null}

      <Card title="QR tag" icon="qr">
        <PlaceholderNote item={12}>
          A printable QR code for this plant that links to its page on the website.
        </PlaceholderNote>
        <View style={styles.recordId}>
          <ThemedText type="small" themeColor="textSecondary">
            Record ID
          </ThemedText>
          <ThemedText type="code" selectable>
            {record.id}
          </ThemedText>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
  },
  species: {
    fontStyle: 'italic',
  },
  tag: {
    marginTop: Spacing.two,
  },
  recordId: {
    gap: 2,
  },
  ask: {
    gap: Spacing.two,
  },
});

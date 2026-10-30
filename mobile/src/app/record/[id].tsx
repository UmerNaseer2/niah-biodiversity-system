import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { LocationSummary } from '@/components/location-summary';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoRow } from '@/components/ui/info-row';
import { PlaceholderNote } from '@/components/ui/placeholder-note';
import { SyncTag } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
import { conditionLabel, formatHeight, formatRecordedAt } from '@/lib/format';
import { useRecords } from '@/state/records-context';
import { uploadProblemMessage } from '@/sync/upload-row';

const REMOVE_FAILED = "Couldn't remove the record from this phone. Try again.";

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

  async function remove() {
    setRemoving(true);
    setFailed(false);
    try {
      await removeDeleted(id);
      router.dismissTo('/records');
    } catch (error) {
      console.warn("Couldn't remove the record.", error);
      setFailed(true);
      setRemoving(false);
      // On the web the role="alert" below does the same job.
      if (Platform.OS !== 'web') {
        AccessibilityInfo.announceForAccessibility(REMOVE_FAILED);
      }
    }
  }

  if (!asking) {
    return (
      <Button label="Remove from this phone" variant="outline" onPress={() => setAsking(true)} />
    );
  }

  return (
    <View style={styles.ask}>
      <ThemedText type="smallBold">
        The server doesn&apos;t have this record any more, so once it&apos;s off this phone
        it&apos;s gone for good. Remove it?
      </ThemedText>
      <Button label="Remove it" onPress={remove} disabled={removing} />
      <Button
        label="Keep it"
        variant="outline"
        onPress={() => setAsking(false)}
        disabled={removing}
      />
      {failed ? (
        <ThemedText type="small" themeColor="danger" role="alert">
          {REMOVE_FAILED}
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
          <SyncTag status={record.syncStatus} problem={record.uploadProblem} />
        </View>
      </View>

      {record.uploadProblem ? (
        <Card title="Couldn't upload" icon="warning">
          <ThemedText>{uploadProblemMessage(record.uploadProblem)}</ThemedText>
          {record.uploadProblem === 'deleted' ? <RemoveDeleted id={record.id} /> : null}
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

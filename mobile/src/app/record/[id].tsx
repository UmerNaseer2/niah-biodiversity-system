import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
import { conditionLabel, formatHeight, formatRecordedAt } from '@/lib/format';
import { useRecords } from '@/state/records-context';

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
          <SyncTag status={record.syncStatus} />
        </View>
      </View>

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
});

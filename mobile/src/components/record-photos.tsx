import { StyleSheet, View } from 'react-native';

import { PhotoGrid, PhotoThumb } from '@/components/photo-thumb';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { plural } from '@/lib/format';
import { useAccount } from '@/state/account-context';
import { useRecords } from '@/state/records-context';
import type { PlantRecord, RecordPhoto } from '@/types/plant-record';

/** Where the record's photos have got to, as far as this phone knows. */
function uploadStatus(record: PlantRecord, photos: RecordPhoto[], accountId?: string) {
  if (record.syncStatus === 'pending') {
    return photos.length === 1
      ? 'It goes up after the record does.'
      : 'They go up after the record does.';
  }
  const waiting = photos.filter((photo) => !photo.uploadedAt && !photo.problem).length;
  if (waiting === 0) {
    return photos.every((photo) => photo.uploadedAt) ? 'On the server as well.' : null;
  }
  const count = `${plural(waiting, 'photo')} still on this phone only.`;
  if (accountId === record.uploadedBy) {
    return waiting === 1
      ? `${count} It goes up on its own when you have signal.`
      : `${count} They go up on their own when you have signal.`;
  }
  return waiting === 1
    ? `${count} The website looks for it under the account that sent this record, so it waits until that account signs in.`
    : `${count} The website looks for them under the account that sent this record, so they wait until that account signs in.`;
}

function problemText({ position, problem }: RecordPhoto) {
  if (problem === 'missing') {
    return `Photo ${position} isn't on this phone any more, so it can't upload.`;
  }
  return `The server turned down photo ${position}. Press Sync now to try again.`;
}

/** The Photos card on a record. Nothing shows when this phone has no photos of it. */
export function RecordPhotos({ record }: { record: PlantRecord }) {
  const { photosFor } = useRecords();
  const { account } = useAccount();
  const photos = photosFor(record.id);
  if (photos.length === 0) {
    return null;
  }
  const status = uploadStatus(record, photos, account?.userId);

  return (
    <Card title="Photos" icon="camera">
      <PhotoGrid>
        {photos.map((photo) => (
          <PhotoThumb key={photo.position} path={photo.path} label={`Photo ${photo.position}`} />
        ))}
      </PhotoGrid>
      <View style={styles.status}>
        {status ? (
          <ThemedText type="small" themeColor="textSecondary">
            {status}
          </ThemedText>
        ) : null}
        {photos
          .filter((photo) => photo.problem)
          .map((photo) => (
            <ThemedText key={photo.position} type="small" themeColor="danger">
              {problemText(photo)}
            </ThemedText>
          ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  status: {
    gap: Spacing.one,
  },
});

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { PlaceholderNote } from '@/components/ui/placeholder-note';
import { Radius } from '@/constants/theme';
import { useRecords } from '@/state/records-context';

// The viewfinder stays dark in both themes so it looks like a camera feed.
const VIEWFINDER_BACKGROUND = '#0B120D';
const VIEWFINDER_FOREGROUND = '#FFFFFF';

export default function ScanScreen() {
  const router = useRouter();
  const { records, findByTag } = useRecords();
  const [code, setCode] = useState('');
  const [notFound, setNotFound] = useState(false);

  function openRecord(id: string) {
    router.push({ pathname: '/record/[id]', params: { id } });
  }

  function simulateScan() {
    const record = records[Math.floor(Math.random() * records.length)];
    if (record) {
      openRecord(record.id);
    }
  }

  function lookUp() {
    if (code.trim() === '') {
      return;
    }
    const record = findByTag(code);
    if (!record) {
      setNotFound(true);
      return;
    }
    setCode('');
    openRecord(record.id);
  }

  return (
    <Screen title="Scan a tag" subtitle="Point the camera at the QR tag on the plant.">
      <View style={styles.viewfinder}>
        <View style={[styles.corner, styles.topLeft]} />
        <View style={[styles.corner, styles.topRight]} />
        <View style={[styles.corner, styles.bottomLeft]} />
        <View style={[styles.corner, styles.bottomRight]} />
        <Icon name="qr" size={56} color={VIEWFINDER_FOREGROUND} />
        <ThemedText type="smallBold" style={styles.viewfinderText}>
          Camera preview goes here
        </ThemedText>
      </View>

      <Button
        label="Simulate a scan"
        icon="scan"
        onPress={simulateScan}
        disabled={records.length === 0}
      />

      <PlaceholderNote item={6}>
        The camera and QR reading come with expo-camera. Until then, Simulate a scan opens a random
        record so the rest of the flow can be tested.
      </PlaceholderNote>

      <Card title="Type the tag code" icon="keyboard">
        <Field
          label="Tag code"
          placeholder="NNP-3F2A9C"
          value={code}
          onChangeText={(text) => {
            setCode(text);
            setNotFound(false);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={lookUp}
          hint="Use this if the tag is dirty, wet or won't scan."
          error={notFound ? 'No record with that tag on this phone.' : undefined}
        />
        <Button
          label="Find record"
          icon="search"
          variant="outline"
          onPress={lookUp}
          disabled={code.trim() === ''}
        />
      </Card>
    </Screen>
  );
}

const CORNER_INSET = 20;

const styles = StyleSheet.create({
  viewfinder: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: Radius.xl,
    backgroundColor: VIEWFINDER_BACKGROUND,
  },
  viewfinderText: {
    color: VIEWFINDER_FOREGROUND,
    opacity: 0.85,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: VIEWFINDER_FOREGROUND,
  },
  topLeft: {
    top: CORNER_INSET,
    left: CORNER_INSET,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: Radius.md,
  },
  topRight: {
    top: CORNER_INSET,
    right: CORNER_INSET,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: Radius.md,
  },
  bottomLeft: {
    bottom: CORNER_INSET,
    left: CORNER_INSET,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: Radius.md,
  },
  bottomRight: {
    bottom: CORNER_INSET,
    right: CORNER_INSET,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: Radius.md,
  },
});

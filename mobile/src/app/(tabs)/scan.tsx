import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { QrScanner } from '@/components/qr-scanner';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { isNewScan, parseTagQr } from '@/lib/qr';
import { useRecords } from '@/state/records-context';

export default function ScanScreen() {
  const router = useRouter();
  const { findByTag } = useRecords();
  const [code, setCode] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [scanProblem, setScanProblem] = useState<string>();
  // When each QR code was last in view, so a code held in front of the camera only counts once.
  const seen = useRef(new Map<string, number>());
  // The QR code that opened the record on top. While it's set every other code is ignored, so
  // two quick scans can't open two records.
  const opened = useRef<string | undefined>(undefined);
  // The same code after coming back. It's probably still in front of the camera, so it has to
  // leave the view before it opens the record again.
  const held = useRef<string | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      seen.current.clear();
      held.current = opened.current;
      opened.current = undefined;
      if (held.current) {
        seen.current.set(held.current, Date.now());
      }
      return () => setScanProblem(undefined);
    }, []),
  );

  function openRecord(id: string) {
    router.push({ pathname: '/record/[id]', params: { id } });
  }

  function handleCameraReady() {
    // The camera can take a second or two to start on a slow phone, so the held code's time in
    // view starts again from here.
    if (held.current) {
      seen.current.set(held.current, Date.now());
      held.current = undefined;
    }
  }

  function showProblem(message: string) {
    setScanProblem(message);
    // Read out on every scan, even when it's the same message as last time.
    if (Platform.OS !== 'web') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }

  function handleScan(data: string) {
    if (opened.current || !isNewScan(seen.current, data, Date.now())) {
      return;
    }
    const tag = parseTagQr(data);
    if (!tag) {
      showProblem("That QR code isn't a Niah plant tag.");
      return;
    }
    const record = findByTag(tag);
    if (!record) {
      showProblem(`No record with tag ${tag} on this phone.`);
      return;
    }
    opened.current = data;
    setScanProblem(undefined);
    openRecord(record.id);
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
    <Screen hasInputs title="Scan a tag" subtitle="Point the camera at the QR tag on the plant.">
      <QrScanner onScan={handleScan} onReady={handleCameraReady} problem={scanProblem} />

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

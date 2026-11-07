import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { QrScanner } from '@/components/qr-scanner';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { isNewScan, parseTagQr } from '@/lib/qr';
import { useRecords } from '@/state/records-context';

const SHOWS_LATER = "It'll show once this phone is online and the plant info updates.";

export default function ScanScreen() {
  const router = useRouter();
  const { findByTag, findPublicByTag, mode, saveScan } = useRecords();
  const visitor = mode === 'visitor';
  const [code, setCode] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [scanProblem, setScanProblem] = useState<string>();
  // When each QR code was last in view, so a code held in front of the camera only counts once.
  const seen = useRef(new Map<string, number>());
  // The QR code that opened the page on top. While it's set every other code is ignored, so
  // two quick scans can't open two pages.
  const opened = useRef<string | undefined>(undefined);
  // The same code after coming back. It's probably still in front of the camera, so it has to
  // leave the view before it opens the page again.
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

  /**
   * The page a tag opens, if there is one. Staff get their own record first and then the saved
   * plant info, since they can scan a tag someone else recorded. Visitors only get the plant info.
   */
  function pageFor(input: string): Href | undefined {
    const record = visitor ? undefined : findByTag(input);
    if (record) {
      return { pathname: '/record/[id]', params: { id: record.id } };
    }
    const plant = findPublicByTag(input);
    return plant ? { pathname: '/plant/[tag]', params: { tag: plant.tagCode } } : undefined;
  }

  /**
   * Puts a visitor's tag in History, even when there's no info for it yet, so they can look again
   * after the plant info updates. A typed code with no plant is only kept when it's a whole tag
   * code, so half a code doesn't end up there.
   */
  function remember(input: string) {
    const tagCode = findPublicByTag(input)?.tagCode ?? parseTagQr(input);
    if (!visitor || tagCode === undefined) {
      return;
    }
    // The visitor can still read about the plant if this fails, so it's only logged.
    saveScan(tagCode).catch((error: unknown) => {
      console.warn("Couldn't save the scan to History.", error);
    });
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
    remember(tag);
    const page = pageFor(tag);
    if (!page) {
      showProblem(
        visitor
          ? `No plant info for tag ${tag} yet. ${SHOWS_LATER}`
          : `No record with tag ${tag} on this phone.`,
      );
      return;
    }
    opened.current = data;
    setScanProblem(undefined);
    router.push(page);
  }

  function lookUp() {
    if (code.trim() === '') {
      return;
    }
    remember(code);
    const page = pageFor(code);
    if (!page) {
      setNotFound(true);
      return;
    }
    setCode('');
    router.push(page);
  }

  const notFoundMessage = visitor
    ? `No plant info for that tag yet. ${SHOWS_LATER}`
    : 'No record with that tag on this phone.';

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
          error={notFound ? notFoundMessage : undefined}
        />
        <Button
          label={visitor ? 'Find plant' : 'Find record'}
          icon="search"
          variant="outline"
          onPress={lookUp}
          disabled={code.trim() === ''}
        />
      </Card>
    </Screen>
  );
}

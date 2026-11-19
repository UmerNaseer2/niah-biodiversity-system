import { scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { QrScanner } from '@/components/qr-scanner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { isNewScan, parseTagQr, pickPhotoQr } from '@/lib/qr';
import { useRecords } from '@/state/records-context';

const SHOWS_LATER = "It'll show once this phone is online and the plant info updates.";
const NOT_A_TAG = "That QR code isn't a Niah plant tag.";
const LIBRARY_FAILED = "The photo library wouldn't open. Please try again.";
const PHOTO_FAILED = "Couldn't read that photo. Try another one, or type the tag code below.";
const NO_QR = "Couldn't find a QR code in that photo. Try one that's closer and in focus.";

// One photo, at full size, since a small or squashed QR code is harder to read.
const PHOTO_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
// The library takes a second or two to open, so the button says so instead of looking stuck.
const PHOTO_LABELS = {
  idle: 'Choose a photo',
  opening: 'Opening your photos…',
  reading: 'Reading the photo…',
};

/** Where the scan went: the page to open, or what to tell the person instead. */
type ScanResult = { page: Href } | { problem: string };

export default function ScanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { findByTag, findPublicByTag, mode, saveScan } = useRecords();
  const visitor = mode === 'visitor';
  const [code, setCode] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [scanProblem, setScanProblem] = useState<string>();
  const [photoProblem, setPhotoProblem] = useState<string>();
  // Where the photo button is up to, so its label says what's really happening.
  const [photoStep, setPhotoStep] = useState<'idle' | 'opening' | 'reading'>('idle');
  // State only changes on the next render, which is too late to stop a second tap.
  const choosingPhoto = useRef(false);
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
      return () => {
        setScanProblem(undefined);
        setPhotoProblem(undefined);
      };
    }, []),
  );

  /**
   * The page a tag opens, if there is one. Staff get their own record first and then the saved
   * plant info, since they can scan a tag someone else recorded. Any other tag code opens the
   * plant page for staff too, which looks it up on the server, because the plant may have been
   * recorded on another phone and not approved yet. Visitors only get the plant info.
   */
  function pageFor(input: string): Href | undefined {
    const record = visitor ? undefined : findByTag(input);
    if (record) {
      return { pathname: '/record/[id]', params: { id: record.id } };
    }
    const plant = findPublicByTag(input);
    if (plant) {
      return { pathname: '/plant/[tag]', params: { tag: plant.tagCode } };
    }
    // A typed code can leave out the NNP- part, the same as when it's found on the phone.
    const tag = visitor ? undefined : (parseTagQr(input) ?? parseTagQr(`NNP-${input}`));
    return tag ? { pathname: '/plant/[tag]', params: { tag } } : undefined;
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
    announce(message);
  }

  /** The same for a QR code from the camera or from a photo. */
  function readScan(data: string): ScanResult {
    const tag = parseTagQr(data);
    if (!tag) {
      return { problem: NOT_A_TAG };
    }
    remember(tag);
    const page = pageFor(tag);
    // Staff always get a page for a tag, so this is only ever for visitors.
    return page ? { page } : { problem: `No plant info for tag ${tag} yet. ${SHOWS_LATER}` };
  }

  function handleScan(data: string) {
    if (opened.current || !isNewScan(seen.current, data, Date.now())) {
      return;
    }
    const result = readScan(data);
    if ('problem' in result) {
      showProblem(result.problem);
      return;
    }
    opened.current = data;
    setScanProblem(undefined);
    router.push(result.page);
  }

  /** Reads the tag in a photo from the library. Gives back what went wrong, if anything did. */
  async function scanPhoto(): Promise<string | undefined> {
    let picked: ImagePicker.ImagePickerResult;
    try {
      picked = await ImagePicker.launchImageLibraryAsync(PHOTO_OPTIONS);
    } catch (error) {
      console.warn("Couldn't open the photo library.", error);
      return LIBRARY_FAILED;
    }
    const photo = picked.canceled ? undefined : picked.assets[0];
    if (!photo) {
      return undefined;
    }
    setPhotoStep('reading');
    let texts: string[];
    try {
      texts = (await scanFromURLAsync(photo.uri, ['qr'])).map((code) => code.data);
    } catch (error) {
      console.warn("Couldn't read the QR code in the photo.", error);
      return PHOTO_FAILED;
    }
    const qr = pickPhotoQr(texts);
    if (qr.found === 'none') {
      return NO_QR;
    }
    if (qr.found === 'several') {
      return `That photo has ${qr.count} different tags in it. Choose a photo of just one.`;
    }
    const result = readScan(qr.data);
    if ('problem' in result) {
      return result.problem;
    }
    // The camera keeps going behind the library, so it may have opened a tag already.
    if (!opened.current) {
      opened.current = qr.data;
      setScanProblem(undefined);
      router.push(result.page);
    }
    return undefined;
  }

  async function choosePhoto() {
    if (choosingPhoto.current) {
      return;
    }
    choosingPhoto.current = true;
    setPhotoStep('opening');
    setPhotoProblem(undefined);
    try {
      const problem = await scanPhoto();
      if (problem) {
        setPhotoProblem(problem);
        announce(problem);
      }
    } finally {
      choosingPhoto.current = false;
      setPhotoStep('idle');
    }
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

  // Staff get the plant page for any whole tag code, so for them it's only ever something else.
  const notFoundMessage = visitor
    ? `No plant info for that tag yet. ${SHOWS_LATER}`
    : "That isn't a tag code. They look like NNP-3F2A9C.";

  return (
    <Screen hasInputs title="Scan a tag" subtitle="Point the camera at the QR tag on the plant.">
      <QrScanner onScan={handleScan} onReady={handleCameraReady} problem={scanProblem} />

      <Card title="Scan a photo of the tag" icon="library">
        <ThemedText themeColor="textSecondary">
          Choose a photo of a tag from your library, like one you took earlier or were sent.
        </ThemedText>
        {photoProblem ? (
          <View style={[styles.problem, { backgroundColor: theme.warningSoft }]}>
            <Icon name="warning" size={18} color={theme.warning} />
            <ThemedText type="small" themeColor="warning" role="alert" style={styles.problemText}>
              {photoProblem}
            </ThemedText>
          </View>
        ) : null}
        <Button
          label={PHOTO_LABELS[photoStep]}
          icon="library"
          variant="outline"
          onPress={choosePhoto}
          disabled={photoStep !== 'idle'}
        />
      </Card>

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
          label="Find plant"
          icon="search"
          variant="outline"
          onPress={lookUp}
          disabled={code.trim() === ''}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  problem: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: 12,
    borderRadius: Radius.md,
  },
  problemText: {
    flex: 1,
  },
});

import * as Print from 'expo-print';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { announce } from '@/lib/announce';
import { QUIET_ZONE, qrPath, qrSquares, qrViewBox, tagPrintHtml } from '@/lib/qr-code';
import { tagQrText, tagWebsite } from '@/lib/qr';
import type { PlantRecord } from '@/types/plant-record';

// The print call only prints the page the app is on when it runs on the web.
const CAN_PRINT = Platform.OS !== 'web';

const MAX_QR_SIZE = 240;

const PRINT_FAILED = "Couldn't open the print window. Try again.";

/** Closing the iOS print window without printing rejects the call, and that isn't a failure. */
function closedWithoutPrinting(error: unknown) {
  return (error as { code?: unknown } | null)?.code === 'ERR_PRINT_INCOMPLETE';
}

/** Why a tag for this record would be wrong, if it would. */
function noTagReason({ uploadProblem }: PlantRecord) {
  if (uploadProblem === 'tag-clash') {
    return 'Another plant on the server already has this tag code. Get a new tag above and the QR code shows up here.';
  }
  if (uploadProblem === 'deleted') {
    return "This record isn't on the server any more, so a tag on the plant would lead nowhere.";
  }
  return null;
}

/** What someone gets by scanning the tag right now. */
function scanNote({ reviewStatus }: PlantRecord, website: string | undefined) {
  const inApp = 'The Scan tab opens this record, even with no signal.';
  if (!website) {
    return `${inApp} This build has no website address, so the QR code only holds the tag code and a normal phone camera won't open a page from it.`;
  }
  if (reviewStatus === 'published') {
    return `${inApp} A normal phone camera opens the plant's public page.`;
  }
  if (reviewStatus === 'rejected') {
    return `${inApp} An officer rejected this record, so the website has no page for this tag.`;
  }
  return `${inApp} A normal phone camera gets "no plant with that tag yet" until an officer approves the record.`;
}

/** The tag code in black on white. Dark mode can't change it, or some scanners can't read it. */
export function QrTag({ record }: { record: PlantRecord }) {
  const printing = useRef(false);
  const [printFailed, setPrintFailed] = useState(false);

  const reason = noTagReason(record);
  if (reason) {
    return (
      <ThemedText type="small" themeColor="danger">
        {reason}
      </ThemedText>
    );
  }

  const website = tagWebsite();
  const text = tagQrText(record.tagCode, website);
  const squares = qrSquares(text);
  // A whole number of points per square, so the edges stay sharp enough for a screen to be scanned.
  const across = squares.length + QUIET_ZONE * 2;
  const size = Math.floor(MAX_QR_SIZE / across) * across;

  async function printTag() {
    if (printing.current) {
      return;
    }
    printing.current = true;
    setPrintFailed(false);
    try {
      await Print.printAsync({ html: tagPrintHtml(record.tagCode, text) });
    } catch (error) {
      if (!closedWithoutPrinting(error)) {
        console.warn("Couldn't print a tag.", error);
        setPrintFailed(true);
        announce(PRINT_FAILED);
      }
    } finally {
      printing.current = false;
    }
  }

  return (
    <View style={styles.tag}>
      <View
        role="img"
        accessibilityLabel={`QR code for tag ${record.tagCode}`}
        style={styles.tile}
        testID="qr-tile">
        <Svg width={size} height={size} viewBox={qrViewBox(squares.length)}>
          <Path d={qrPath(squares)} fill="#000000" />
        </Svg>
        <ThemedText type="smallBold" style={styles.code}>
          {record.tagCode}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {scanNote(record, website)}
      </ThemedText>
      {record.syncStatus === 'pending' ? (
        <ThemedText type="small" themeColor="warning">
          This code isn&apos;t checked until the record uploads. If another plant already has it
          you&apos;d need a new tag, so print after the upload if you can.
        </ThemedText>
      ) : null}
      {CAN_PRINT ? (
        <Button label="Print this tag" icon="print" variant="secondary" onPress={printTag} />
      ) : null}
      {printFailed ? (
        <ThemedText type="small" themeColor="danger">
          {PRINT_FAILED}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    gap: Spacing.two,
  },
  tile: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: Radius.md,
    paddingBottom: Spacing.two,
  },
  code: {
    color: '#000000',
  },
});

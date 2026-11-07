import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScanRow } from '@/components/scan-row';
import { ListScreen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { announce } from '@/lib/announce';
import { speciesOf } from '@/lib/plant-info';
import { useRecords } from '@/state/records-context';

const CLEAR_ASK = 'This takes every scan off History on this phone. Clear it?';
const CLEAR_FAILED = "Couldn't clear the history. Try again.";

/** Empties History. It asks first, because the scans aren't kept anywhere else. */
function ClearHistory() {
  const { clearScans } = useRecords();
  const [asking, setAsking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [failed, setFailed] = useState(false);
  // Two quick taps can both land before the button shows as disabled.
  const busy = useRef(false);

  function ask() {
    setAsking(true);
    // The button that had focus is gone now, so nothing else would say the question appeared.
    announce(CLEAR_ASK);
  }

  function keep() {
    setAsking(false);
    setFailed(false);
  }

  async function clear() {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setClearing(true);
    setFailed(false);
    try {
      await clearScans();
      // The list is empty now, so this button goes away and the empty message shows instead.
      announce('History cleared.');
    } catch (error) {
      console.warn("Couldn't clear the history.", error);
      busy.current = false;
      setFailed(true);
      setClearing(false);
      announce(CLEAR_FAILED);
    }
  }

  if (!asking) {
    return <Button label="Clear history" icon="trash" variant="outline" onPress={ask} />;
  }

  return (
    <View style={styles.ask}>
      <ThemedText type="smallBold" role="alert">
        {CLEAR_ASK}
      </ThemedText>
      <Button label={clearing ? 'Clearing...' : 'Clear it'} onPress={clear} disabled={clearing} />
      <Button label="Keep it" variant="outline" onPress={keep} disabled={clearing} />
      {failed ? (
        <ThemedText type="small" themeColor="danger" role="alert">
          {CLEAR_FAILED}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** The tags a visitor scanned on this phone, newest first. Each one opens its plant page. */
export default function HistoryScreen() {
  const router = useRouter();
  const { scans, findPublicByTag, publicSpecies } = useRecords();
  // Changes when the app comes back to the front, which redraws the "Today" on each scan.
  const now = useNow();

  return (
    <ListScreen
      title="History"
      subtitle="The tags you scanned, newest first. They're only kept on this phone."
      header={scans.length > 0 ? <ClearHistory /> : null}
      data={scans}
      keyExtractor={(scan) => scan.tagCode}
      renderItem={(scan) => {
        const plant = findPublicByTag(scan.tagCode);
        return (
          <ScanRow
            scan={scan}
            plant={plant}
            species={plant ? speciesOf(plant, publicSpecies) : undefined}
            now={now}
          />
        );
      }}
      empty={
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary">
            No scans yet. Tags you scan show up here.
          </ThemedText>
          <Button
            label="Scan a plant tag"
            icon="scan"
            variant="secondary"
            onPress={() => router.navigate('/scan')}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  ask: {
    gap: Spacing.two,
  },
  empty: {
    gap: 12,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});

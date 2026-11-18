import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoRow } from '@/components/ui/info-row';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { conditionLabel, formatParkDate } from '@/lib/format';
import { parseTagQr } from '@/lib/qr';
import { getSupabase } from '@/lib/supabase';
import { findPlantOnServer, type FindPlantResult, type FoundPlant } from '@/sync/find-plant';
import type { ReviewStatus } from '@/types/plant-record';

const REVIEW_LABELS: Record<ReviewStatus, string> = {
  waiting: 'Waiting for review',
  published: 'Approved',
  rejected: 'Rejected',
};

/** Opens the form for a visit to a plant that isn't on this phone, with its names filled in. */
export function addVisitParams(plant: {
  id: string;
  speciesName: string;
  commonName?: string;
}) {
  return {
    visitOf: plant.id,
    plantSpecies: plant.speciesName,
    plantCommonName: plant.commonName ?? '',
  };
}

/**
 * A plant that isn't on this phone, looked up on the server for field staff. It was most likely
 * recorded on another phone and hasn't been approved yet, so it isn't in the plant info either.
 * The server only gives back what's needed to add a visit to it.
 */
export function ServerPlant({ tag }: { tag: string }) {
  const tagCode = parseTagQr(tag);
  const supabase = getSupabase();
  const [result, setResult] = useState<FindPlantResult | 'looking'>('looking');
  // Try again counts up, which runs the lookup again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase || !tagCode) {
      return;
    }
    let current = true;
    findPlantOnServer(supabase, tagCode)
      .then((answer) => {
        if (current) {
          setResult(answer);
        }
      })
      .catch((error: unknown) => {
        console.warn("Couldn't look up the plant.", error);
        if (current) {
          setResult({ kind: 'failed' });
        }
      });
    return () => {
      current = false;
    };
  }, [supabase, tagCode, attempt]);

  function tryAgain() {
    setResult('looking');
    setAttempt((count) => count + 1);
  }

  if (!tagCode) {
    return <NotFound tag={tag} />;
  }
  if (!supabase) {
    return (
      <Problem title="Can't look up plants" retry={undefined}>
        This copy of the app isn&apos;t linked to the server, so it can only find plants saved on
        this phone.
      </Problem>
    );
  }
  if (result === 'looking') {
    return <Looking />;
  }
  switch (result.kind) {
    case 'found':
      return <FoundPlantInfo plant={result.plant} />;
    case 'none':
      return <NotFound tag={tagCode} />;
    case 'offline':
      return (
        <Problem title="No signal" retry={tryAgain}>
          Tag {tagCode} isn&apos;t on this phone, so it was probably recorded on another phone. The
          app needs signal to look it up.
        </Problem>
      );
    case 'not-allowed':
      return (
        <Problem title="Can't look up plants" retry={undefined}>
          Only field staff can look up a plant recorded on another phone. Check you&apos;re signed in
          on the Profile tab.
        </Problem>
      );
    case 'failed':
      return (
        <Problem title="Couldn't look up the plant" retry={tryAgain}>
          The server didn&apos;t answer the way the app expected. Try again in a minute.
        </Problem>
      );
  }
}

function Looking() {
  const theme = useTheme();
  return (
    <Card title="Looking up this plant" icon="search">
      <View style={styles.looking}>
        <ActivityIndicator color={theme.primary} />
        <ThemedText themeColor="textSecondary" style={styles.lookingText}>
          It isn&apos;t on this phone, so the app is asking the server.
        </ThemedText>
      </View>
    </Card>
  );
}

function ScanAgain() {
  const router = useRouter();
  // dismissTo goes back to the tabs that are already open. navigate would stack a second copy of
  // them on top of this screen.
  return (
    <Button
      label="Scan a plant tag"
      icon="scan"
      variant="outline"
      onPress={() => router.dismissTo('/scan')}
    />
  );
}

function NotFound({ tag }: { tag: string }) {
  return (
    <Card title="No plant with this tag" icon="warning">
      <ThemedText themeColor="textSecondary">
        No record has tag {tag}, on this phone or on the server. Check the code on the tag, or the
        record may have been deleted.
      </ThemedText>
      <ScanAgain />
    </Card>
  );
}

function Problem({
  title,
  retry,
  children,
}: {
  title: string;
  retry: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <Card title={title} icon="warning">
      <ThemedText themeColor="textSecondary">{children}</ThemedText>
      {retry ? <Button label="Try again" icon="sync" onPress={retry} /> : null}
      <ScanAgain />
    </Card>
  );
}

function FoundPlantInfo({ plant }: { plant: FoundPlant }) {
  const router = useRouter();
  const name = plant.commonName ?? plant.speciesName;
  let lastVisit = 'None yet';
  if (plant.lastVisitAt) {
    const date = formatParkDate(plant.lastVisitAt);
    lastVisit = plant.lastVisitCondition
      ? `${date}, ${conditionLabel(plant.lastVisitCondition).toLowerCase()}`
      : date;
  }

  return (
    <>
      <View style={styles.header}>
        <ThemedText type="overline" themeColor="primary">
          Tag {plant.tagCode}
        </ThemedText>
        <ThemedText
          type="title"
          role="heading"
          style={plant.commonName ? undefined : styles.italic}>
          {name}
        </ThemedText>
        {plant.commonName ? (
          <ThemedText type="subtitle" themeColor="textSecondary" style={styles.latinName}>
            {plant.speciesName}
          </ThemedText>
        ) : null}
      </View>

      <Card title="This plant" icon="ruler">
        <InfoRow label="First recorded" value={formatParkDate(plant.recordedAt)} />
        <InfoRow
          label="Condition then"
          value={plant.condition ? conditionLabel(plant.condition) : 'Not recorded'}
        />
        <InfoRow
          label="Visits"
          value={plant.visitCount === 0 ? 'None yet' : String(plant.visitCount)}
        />
        {plant.visitCount > 0 ? <InfoRow label="Last visit" value={lastVisit} /> : null}
        <InfoRow label="Review" value={REVIEW_LABELS[plant.reviewStatus]} />
      </Card>

      <ThemedText type="small" themeColor="textSecondary">
        Recorded on another phone. This phone only gets the plant&apos;s name and how it was doing,
        not where it is, the notes or the photos.
      </ThemedText>

      {/* dismissTo goes back to the tabs that are already open, the same as Add a visit on a
          record's page. */}
      <Button
        label="Add a visit"
        icon="newRecord"
        onPress={() =>
          router.dismissTo({ pathname: '/new-record', params: addVisitParams(plant) })
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
  },
  italic: {
    fontStyle: 'italic',
  },
  latinName: {
    fontStyle: 'italic',
    fontWeight: 400,
  },
  looking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  lookingText: {
    flex: 1,
  },
});

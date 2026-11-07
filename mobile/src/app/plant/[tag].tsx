import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { SpeciesPhoto } from '@/components/species-photo';
import { SpeciesSections } from '@/components/species-sections';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoRow } from '@/components/ui/info-row';
import { IucnChip, ProtectedChip } from '@/components/ui/plant-chips';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { conditionLabel, formatHeight, formatParkDate, formatRecordedAt } from '@/lib/format';
import { hasCommonName, plantName, speciesOf } from '@/lib/plant-info';
import { useRecords } from '@/state/records-context';

const NO_SPECIES = "The field team hasn't matched this plant to a species on our list yet.";

/**
 * A tagged plant from the plant info saved on this phone, so it opens with no signal. It shows the
 * same things as the tag page on the website, apart from where the plant is and the photos the
 * field team took of it.
 */
export default function PlantScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const { findPublicByTag, publicSpecies, publicCopyAt, publicPhotos } = useRecords();
  // Changes when the app comes back to the front, which redraws the "today" in Info from.
  const now = useNow();
  const record = findPublicByTag(tag);

  if (!record) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Not found' }} />
        <Card title="No plant info for this tag yet" icon="warning">
          <ThemedText themeColor="textSecondary">
            It&apos;ll show once this phone is online and the plant info updates. New records only
            show up after a conservation officer approves them.
          </ThemedText>
          {/* dismissTo goes back to the tabs that are already open. navigate would stack a
              second copy of them on top of this screen. */}
          <Button
            label="Scan a plant tag"
            icon="scan"
            variant="outline"
            onPress={() => router.dismissTo('/scan')}
          />
        </Card>
      </Screen>
    );
  }

  const species = speciesOf(record, publicSpecies);
  const name = plantName(record, species);
  const latinName = species ? species.scientificName : record.speciesName;
  const otherNames = species ? species.commonNames.filter((common) => common !== name) : [];
  const summary = species ? species.summary.trim() : NO_SPECIES;
  const photo = species && publicPhotos.find((item) => item.speciesSlug === species.slug);
  // Recent times start with "Today" or "Yesterday", which read better in lower case here.
  const when = publicCopyAt ? formatRecordedAt(publicCopyAt, now) : undefined;
  const infoFrom = when ? `Info from ${when.charAt(0).toLowerCase()}${when.slice(1)}` : undefined;

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="overline" themeColor="primary">
          Tag {record.tagCode}
        </ThemedText>
        <ThemedText
          type="title"
          role="heading"
          style={!hasCommonName(record, species) && styles.italic}>
          {name}
        </ThemedText>
        {latinName !== name ? (
          <ThemedText type="subtitle" themeColor="textSecondary" style={styles.latinName}>
            {latinName}
          </ThemedText>
        ) : null}
        {otherNames.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Also called {otherNames.join(', ')}
          </ThemedText>
        ) : null}
        {species && species.family.trim() !== '' ? (
          <ThemedText type="small" themeColor="textSecondary">
            {species.family.trim()} family
          </ThemedText>
        ) : null}
        {species?.newerName ? (
          <ThemedText type="small" themeColor="textSecondary">
            Newer sources put it in a different genus, as{' '}
            <ThemedText type="small" themeColor="textSecondary" style={styles.italic}>
              {species.newerName}
            </ThemedText>
            .
          </ThemedText>
        ) : null}
        {species ? (
          <View style={styles.chips}>
            <IucnChip code={species.iucnCode} />
            {species.sarawakProtected ? <ProtectedChip /> : null}
          </View>
        ) : null}
      </View>

      {summary !== '' ? (
        <ThemedText themeColor={species ? 'text' : 'textSecondary'}>{summary}</ThemedText>
      ) : null}

      <Card title="This plant" icon="ruler">
        <InfoRow label="Height" value={formatHeight(record.heightM)} />
        <InfoRow
          label="Condition"
          value={record.condition ? conditionLabel(record.condition) : 'Not recorded'}
        />
        <InfoRow label="Recorded" value={formatParkDate(record.recordedAt)} />
      </Card>

      {photo?.file ? (
        <Card title="Photo" icon="library">
          <ThemedText type="small" themeColor="textSecondary">
            This photo shows the species, not this plant.
          </ThemedText>
          <SpeciesPhoto photo={photo} name={name} />
        </Card>
      ) : null}

      {species ? <SpeciesSections species={species} /> : null}

      {species ? (
        <Button
          label="More about this species"
          icon="leaf"
          variant="outline"
          onPress={() =>
            router.push({ pathname: '/species/[slug]', params: { slug: species.slug } })
          }
        />
      ) : null}

      {infoFrom ? (
        <ThemedText type="small" themeColor="textSecondary">
          {infoFrom}
        </ThemedText>
      ) : null}
    </Screen>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});

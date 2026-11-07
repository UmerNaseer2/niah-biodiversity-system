import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { SpeciesPhoto } from '@/components/species-photo';
import { SpeciesSections } from '@/components/species-sections';
import { TaggedPlantRow } from '@/components/tagged-plant-row';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { IucnChip, ProtectedChip } from '@/components/ui/plant-chips';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { formatRecordedAt } from '@/lib/format';
import { taggedPlants } from '@/lib/species-list';
import { useRecords } from '@/state/records-context';

const NONE_TAGGED =
  'No tagged plants of this species are public yet. New records only show up here after a ' +
  'conservation officer approves them.';

/**
 * A species from the plant info saved on this phone, so it opens with no signal. It shows the same
 * things as the species page on the website, apart from where its plants are.
 */
export default function SpeciesScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { publicSpecies, publicRecords, publicPhotos, publicCopyAt } = useRecords();
  // Changes when the app comes back to the front, which redraws the "today" in Info from.
  const now = useNow();
  const species = publicSpecies.find((item) => item.slug === slug);

  if (!species) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Not found' }} />
        <Card title="No plant info for this species yet" icon="warning">
          <ThemedText themeColor="textSecondary">
            It&apos;ll show once this phone is online and the plant info updates.
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  const name = species.commonNames[0] ?? species.scientificName;
  const hasCommonName = species.commonNames.length > 0;
  const otherNames = species.commonNames.slice(1);
  const family = species.family.trim();
  const authority = species.authority.trim();
  const summary = species.summary.trim();
  const photo = publicPhotos.find((item) => item.speciesSlug === species.slug);
  const tagged = taggedPlants(publicRecords, species.slug);
  // Recent times start with "Today" or "Yesterday", which read better in lower case here.
  const when = publicCopyAt ? formatRecordedAt(publicCopyAt, now) : undefined;
  const infoFrom = when ? `Info from ${when.charAt(0).toLowerCase()}${when.slice(1)}` : undefined;

  return (
    <Screen>
      <View style={styles.header}>
        {family ? (
          <ThemedText type="overline" themeColor="primary">
            {family}
          </ThemedText>
        ) : null}
        <ThemedText type="title" role="heading" style={!hasCommonName && styles.italic}>
          {name}
        </ThemedText>
        {hasCommonName || authority ? (
          <ThemedText type="subtitle" themeColor="textSecondary" style={styles.regular}>
            {hasCommonName ? (
              <ThemedText type="subtitle" themeColor="textSecondary" style={styles.latinName}>
                {species.scientificName}
              </ThemedText>
            ) : null}
            {hasCommonName && authority ? ' ' : null}
            {authority}
          </ThemedText>
        ) : null}
        {otherNames.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Also called {otherNames.join(', ')}
          </ThemedText>
        ) : null}
        {species.newerName ? (
          <ThemedText type="small" themeColor="textSecondary">
            Newer sources put it in a different genus, as{' '}
            <ThemedText type="small" themeColor="textSecondary" style={styles.italic}>
              {species.newerName}
            </ThemedText>
            .
          </ThemedText>
        ) : null}
        <View style={styles.chips}>
          <IucnChip code={species.iucnCode} />
          {species.sarawakProtected ? <ProtectedChip /> : null}
        </View>
      </View>

      {summary ? <ThemedText>{summary}</ThemedText> : null}

      <SpeciesPhoto photo={photo} name={name} />

      <SpeciesSections species={species} />

      <Card title="Tagged in the park" icon="qr">
        {tagged.length > 0 ? (
          tagged.map((record) => <TaggedPlantRow key={record.id} record={record} />)
        ) : (
          <ThemedText themeColor="textSecondary">{NONE_TAGGED}</ThemedText>
        )}
      </Card>

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
  regular: {
    fontWeight: 400,
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

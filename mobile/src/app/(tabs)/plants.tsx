import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { ListScreen } from '@/components/screen';
import { SpeciesRow } from '@/components/species-row';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { OfflineCard } from '@/components/visitor/visitor-home';
import { Spacing } from '@/constants/theme';
import {
  filterPlants,
  PLANT_FILTERS,
  plantsStatus,
  plantSummaries,
  type PlantFilter,
} from '@/lib/species-list';
import { useRecords } from '@/state/records-context';

const SUBTITLE =
  'Every species our field teams have recorded at Niah so far. Search by common name, ' +
  'Latin name or family.';

/** Every species in the plant info saved on this phone, with a search like the website's. */
export default function PlantsScreen() {
  const { publicSpecies, publicRecords, publicPhotos, publicCopyAt } = useRecords();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlantFilter>('all');
  const search = useRef<TextInput>(null);

  const plants = plantSummaries(publicSpecies, publicRecords);
  const shown = filterPlants(plants, query, filter);
  const photos = new Map(publicPhotos.map((photo) => [photo.speciesSlug, photo]));
  const typed = query.trim();

  function clearSearch() {
    setQuery('');
    setFilter('all');
    search.current?.focus();
  }

  let empty;
  if (publicCopyAt === null) {
    // Nothing has come down yet, so this says how getting the plant info ready is going.
    empty = <OfflineCard />;
  } else if (plants.length === 0) {
    empty = (
      <View style={styles.empty}>
        <ThemedText type="heading" role="heading" style={styles.centred}>
          No plants yet
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centred}>
          Plants show up here once our field teams start recording them.
        </ThemedText>
      </View>
    );
  } else {
    empty = (
      <View style={styles.empty}>
        <ThemedText type="heading" role="heading" style={styles.centred}>
          {typed ? `Nothing matches "${typed}"` : 'No plants match this filter'}
        </ThemedText>
        {typed ? (
          <ThemedText themeColor="textSecondary" style={styles.centred}>
            Check the spelling, or try the Latin name or the family instead.
          </ThemedText>
        ) : null}
        <Button label="Clear search" icon="search" variant="outline" onPress={clearSearch} />
      </View>
    );
  }

  const header =
    plants.length > 0 ? (
      <View style={styles.search}>
        <Field
          ref={search}
          label="Search plants"
          placeholder="Belian, Nepenthes, Dipterocarpaceae..."
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <ChipRow label="Conservation status">
          {PLANT_FILTERS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={filter === option.value}
              onPress={() => setFilter(option.value)}
            />
          ))}
        </ChipRow>
        {/* Android and web screen readers read the count out as it changes. */}
        <View aria-live="polite">
          <ThemedText type="small" themeColor="textSecondary">
            {plantsStatus(plants.length, shown.length)}
          </ThemedText>
        </View>
      </View>
    ) : undefined;

  return (
    <ListScreen
      eyebrow="Species list"
      title="Plants"
      subtitle={SUBTITLE}
      hasInputs
      header={header}
      data={shown}
      keyExtractor={(plant) => plant.species.slug}
      renderItem={(plant) => <SpeciesRow plant={plant} photo={photos.get(plant.species.slug)} />}
      empty={empty}
    />
  );
}

const styles = StyleSheet.create({
  search: {
    gap: Spacing.three,
  },
  empty: {
    gap: 12,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  centred: {
    textAlign: 'center',
  },
});

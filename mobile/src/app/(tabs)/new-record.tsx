import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { LocationSummary } from '@/components/location-summary';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { PlaceholderNote } from '@/components/ui/placeholder-note';
import { Radius, Spacing } from '@/constants/theme';
import { mockGpsReading } from '@/data/mock-records';
import type { SpeciesOption } from '@/data/species-list';
import { useTheme } from '@/hooks/use-theme';
import { conditionLabel, plural } from '@/lib/format';
import {
  checkRecordForm,
  MAX_COMMON_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_SPECIES_LENGTH,
  tidyName,
} from '@/lib/record-form';
import { findSpeciesByName, searchSpecies } from '@/lib/species-search';
import { useRecords } from '@/state/records-context';
import { PLANT_CONDITIONS, type GpsReading, type PlantCondition } from '@/types/plant-record';

// The notes box starts counting down when there are this many characters left.
const NOTES_COUNTDOWN = 100;

export default function NewRecordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { addRecord } = useRecords();

  const [species, setSpecies] = useState('');
  const [commonName, setCommonName] = useState('');
  const [heightText, setHeightText] = useState('');
  const [condition, setCondition] = useState<PlantCondition>('healthy');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState<GpsReading>();
  const [locating, setLocating] = useState(false);
  // Errors only show after someone leaves a field, so they don't flash up mid typing.
  const [touched, setTouched] = useState({ species: false, height: false });
  // Changing this remounts the screen, so the next record starts at the top of the form.
  const [formKey, setFormKey] = useState(0);

  const commonNameRef = useRef<TextInput>(null);
  const heightRef = useRef<TextInput>(null);

  const form = checkRecordForm({
    species,
    heightText,
    locating,
    hasLocation: location !== undefined,
  });

  // A name typed in full still links to the species list, and editing a picked name unlinks it.
  const speciesMatch = findSpeciesByName(species);
  const suggestions = speciesMatch ? [] : searchSpecies(species);

  let speciesHint = 'Scientific name, like Shorea macrophylla';
  if (speciesMatch) {
    speciesHint = 'On the species list.';
  } else if (suggestions.length > 0) {
    speciesHint = "Tap a match below, or keep typing if it isn't there.";
  } else if (tidyName(species) !== '') {
    speciesHint = 'Not on the species list. You can still save it.';
  }

  const notesLeft = MAX_NOTES_LENGTH - notes.length;

  let locationButtonLabel = 'Capture location';
  if (locating) {
    locationButtonLabel = 'Getting location…';
  } else if (location) {
    locationButtonLabel = 'Retake location';
  }

  function pickSpecies(option: SpeciesOption) {
    setSpecies(option.scientificName);
    if (tidyName(commonName) === '') {
      setCommonName(option.commonNames[0]);
    }
  }

  function captureLocation() {
    setLocating(true);
    // Pretend to wait for a GPS fix. Item 8 replaces this with expo-location.
    setTimeout(() => {
      setLocation(mockGpsReading());
      setLocating(false);
    }, 800);
  }

  function resetForm() {
    setSpecies('');
    setCommonName('');
    setHeightText('');
    setCondition('healthy');
    setNotes('');
    setLocation(undefined);
    setTouched({ species: false, height: false });
    setFormKey((key) => key + 1);
  }

  function save() {
    if (!form.canSave) {
      return;
    }
    const record = addRecord({
      // Names on the list are saved the way the list spells them.
      speciesName: speciesMatch?.scientificName ?? tidyName(species),
      speciesSlug: speciesMatch?.slug,
      commonName: tidyName(commonName) || undefined,
      heightM: form.heightM,
      condition,
      notes: notes.trim() || undefined,
      location,
    });
    resetForm();
    router.push({ pathname: '/record/[id]', params: { id: record.id } });
  }

  return (
    <Screen
      key={formKey}
      hasInputs
      title="New plant record"
      subtitle="Fill in what you can. Only the species is required.">
      <Card title="Plant" icon="leaf">
        <View style={styles.speciesGroup}>
          <Field
            label="Species"
            required
            value={species}
            onChangeText={setSpecies}
            onBlur={() => setTouched((current) => ({ ...current, species: true }))}
            autoCorrect={false}
            maxLength={MAX_SPECIES_LENGTH}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => commonNameRef.current?.focus()}
            hint={speciesHint}
            error={touched.species ? form.speciesError : undefined}
          />
          {suggestions.length > 0 ? (
            <View style={[styles.suggestions, { borderColor: theme.border }]}>
              {suggestions.map((option, index) => (
                <Pressable
                  key={option.slug}
                  role="button"
                  aria-label={`Use ${option.scientificName}, ${option.commonNames[0]}`}
                  onPress={() => pickSpecies(option)}
                  style={({ pressed }) => [
                    styles.suggestion,
                    { backgroundColor: pressed ? theme.primarySoft : theme.background },
                    index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  ]}>
                  <ThemedText style={styles.italic}>{option.scientificName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {option.commonNames.slice(0, 3).join(', ')}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <Field
          ref={commonNameRef}
          label="Common name"
          value={commonName}
          onChangeText={setCommonName}
          maxLength={MAX_COMMON_NAME_LENGTH}
          placeholder="Local or English name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => heightRef.current?.focus()}
        />
      </Card>

      <Card title="Measurements" icon="ruler">
        <Field
          ref={heightRef}
          label="Height"
          suffix="m"
          value={heightText}
          onChangeText={setHeightText}
          onBlur={() => setTouched((current) => ({ ...current, height: true }))}
          keyboardType="decimal-pad"
          placeholder="12.5"
          error={touched.height ? form.heightError : undefined}
        />
        <ChipRow label="Condition" showLabel>
          {PLANT_CONDITIONS.map((option) => (
            <Chip
              key={option}
              label={conditionLabel(option)}
              selected={condition === option}
              onPress={() => setCondition(option)}
            />
          ))}
        </ChipRow>
        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={MAX_NOTES_LENGTH}
          placeholder="Damage, flowering, fruit, nearby threats"
          hint={notesLeft <= NOTES_COUNTDOWN ? `${plural(notesLeft, 'character')} left` : undefined}
        />
      </Card>

      <Card title="Location" icon="pin">
        {location ? (
          <LocationSummary location={location} showRetakeTip />
        ) : (
          <ThemedText themeColor="textSecondary">
            Stand next to the plant, then capture. GPS works without phone signal.
          </ThemedText>
        )}
        <Button
          label={locationButtonLabel}
          icon="location"
          variant={location ? 'outline' : 'secondary'}
          onPress={captureLocation}
          disabled={locating}
        />
        <PlaceholderNote item={8}>
          Real GPS comes with expo-location. For now this makes up a point near the park HQ.
        </PlaceholderNote>
      </Card>

      <Card title="Photos" icon="camera">
        <View style={styles.photos}>
          {[1, 2, 3].map((slot) => (
            <View
              key={slot}
              style={[
                styles.photoSlot,
                { borderColor: theme.border, backgroundColor: theme.background },
              ]}>
              <Icon name="addPhoto" size={24} color={theme.textSecondary} />
            </View>
          ))}
        </View>
        <PlaceholderNote item={11}>
          Taking photos goes here. They stay on the phone with the record until it syncs.
        </PlaceholderNote>
      </Card>

      <View style={styles.save}>
        <Button label="Save record" onPress={save} disabled={!form.canSave} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.saveHint}>
          {form.saveHint}
        </ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  speciesGroup: {
    gap: Spacing.two,
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  suggestion: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: Spacing.two,
  },
  italic: {
    fontStyle: 'italic',
  },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoSlot: {
    width: 88,
    height: 88,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  save: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  saveHint: {
    textAlign: 'center',
  },
});

import { useIsFocused, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';

import { LocationCapture } from '@/components/location-capture';
import { PhotoCapture } from '@/components/photo-capture';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Radius, Spacing } from '@/constants/theme';
import type { SpeciesOption } from '@/data/species-list';
import { useGpsCapture } from '@/hooks/use-gps-capture';
import { usePhotoCapture } from '@/hooks/use-photo-capture';
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
import { PLANT_CONDITIONS, type PlantCondition } from '@/types/plant-record';

// The notes box starts counting down when there are this many characters left.
const NOTES_COUNTDOWN = 100;

const SAVE_FAILED = "Couldn't save the record on this phone. Try again.";

export default function NewRecordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { addRecord, species: speciesList } = useRecords();
  const gps = useGpsCapture({ active: useIsFocused() });
  const photos = usePhotoCapture();

  const [species, setSpecies] = useState('');
  const [commonName, setCommonName] = useState('');
  const [heightText, setHeightText] = useState('');
  const [condition, setCondition] = useState<PlantCondition>('healthy');
  const [notes, setNotes] = useState('');
  // Errors only show after someone leaves a field, so they don't flash up mid typing.
  const [touched, setTouched] = useState({ species: false, height: false });
  // Changing this remounts the screen, so the next record starts at the top of the form.
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // Stops a quick second tap straight away, before the button has redrawn as disabled.
  const savingRef = useRef(false);

  const commonNameRef = useRef<TextInput>(null);
  const heightRef = useRef<TextInput>(null);

  const form = checkRecordForm({
    species,
    heightText,
    locating: gps.locating,
    hasLocation: gps.location !== undefined,
  });

  // A name typed in full still links to the species list, and editing a picked name unlinks it.
  const speciesMatch = findSpeciesByName(species, speciesList);
  const suggestions = speciesMatch ? [] : searchSpecies(species, speciesList);

  let speciesHint = 'Scientific name, like Shorea macrophylla';
  if (speciesMatch) {
    speciesHint = 'On the species list.';
  } else if (suggestions.length > 0) {
    speciesHint = "Tap a match below, or keep typing if it isn't there.";
  } else if (tidyName(species) !== '') {
    speciesHint = 'Not on the species list. You can still save it.';
  }

  const notesLeft = MAX_NOTES_LENGTH - notes.length;

  // The save error is about the last tap on Save, so it goes away as soon as anything is changed.
  function edit<T>(set: (value: T) => void) {
    return (value: T) => {
      setSaveFailed(false);
      set(value);
    };
  }

  function pickSpecies(option: SpeciesOption) {
    setSaveFailed(false);
    setSpecies(option.scientificName);
    // Some species on the list have no common name yet, so there is nothing to fill in.
    if (tidyName(commonName) === '') {
      setCommonName(option.commonNames[0] ?? '');
    }
  }

  function resetForm() {
    setSpecies('');
    setCommonName('');
    setHeightText('');
    setCondition('healthy');
    setNotes('');
    gps.clear();
    photos.clear();
    setTouched({ species: false, height: false });
    setFormKey((key) => key + 1);
  }

  async function save() {
    if (!form.canSave || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      const record = await addRecord(
        {
          // Names on the list are saved the way the list spells them.
          speciesName: speciesMatch?.scientificName ?? tidyName(species),
          speciesSlug: speciesMatch?.slug,
          commonName: tidyName(commonName) || undefined,
          heightM: form.heightM,
          condition,
          notes: notes.trim() || undefined,
          location: gps.location,
        },
        photos.paths,
      );
      resetForm();
      router.push({ pathname: '/record/[id]', params: { id: record.id } });
    } catch (error) {
      // Everything typed in stays in the form, so nothing is lost and Save can be tapped again.
      console.warn("Couldn't save the record.", error);
      setSaveFailed(true);
      // On the web the role="alert" below does the same job.
      if (Platform.OS !== 'web') {
        AccessibilityInfo.announceForAccessibility(SAVE_FAILED);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Screen
      key={formKey}
      hasInputs
      title="New plant record"
      subtitle="Fill in what you can. Only the species and location are required.">
      <Card title="Plant" icon="leaf">
        <View style={styles.speciesGroup}>
          <Field
            label="Species"
            required
            value={species}
            onChangeText={edit(setSpecies)}
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
                  aria-label={['Use ' + option.scientificName, option.commonNames[0]]
                    .filter(Boolean)
                    .join(', ')}
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
          onChangeText={edit(setCommonName)}
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
          suffixLabel="metres"
          value={heightText}
          onChangeText={edit(setHeightText)}
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
              onPress={() => edit(setCondition)(option)}
            />
          ))}
        </ChipRow>
        <Field
          label="Notes"
          value={notes}
          onChangeText={edit(setNotes)}
          multiline
          maxLength={MAX_NOTES_LENGTH}
          placeholder="Damage, flowering, fruit, nearby threats"
          hint={notesLeft <= NOTES_COUNTDOWN ? `${plural(notesLeft, 'character')} left` : undefined}
        />
      </Card>

      <Card title="Location" icon="pin">
        <LocationCapture gps={gps} />
      </Card>

      <Card title="Photos" icon="camera">
        <PhotoCapture photos={photos} />
      </Card>

      <View style={styles.save}>
        <Button
          label="Save record"
          onPress={save}
          disabled={!form.canSave || saving || photos.busy}
        />
        {saveFailed ? (
          <ThemedText type="small" themeColor="danger" role="alert" style={styles.saveHint}>
            {SAVE_FAILED}
          </ThemedText>
        ) : null}
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
  save: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  saveHint: {
    textAlign: 'center',
  },
});

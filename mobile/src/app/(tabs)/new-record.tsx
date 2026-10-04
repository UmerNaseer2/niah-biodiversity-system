import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

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
import { useTheme } from '@/hooks/use-theme';
import { conditionLabel } from '@/lib/format';
import { MAX_HEIGHT_M, parseHeight } from '@/lib/height';
import { useRecords } from '@/state/records-context';
import { PLANT_CONDITIONS, type GpsReading, type PlantCondition } from '@/types/plant-record';

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

  const height = parseHeight(heightText);
  const speciesMissing = species.trim() === '';
  const canSave = !speciesMissing && height.valid && !locating;

  let saveHint = 'Saved on this phone first. It uploads when you sync.';
  if (speciesMissing) {
    saveHint = 'Add the species name to save.';
  } else if (!height.valid) {
    saveHint = 'Fix the height to save.';
  } else if (locating) {
    saveHint = 'Waiting for the location…';
  } else if (!location) {
    saveHint = 'You can save without a location, but try to capture one first.';
  }

  let locationButtonLabel = 'Capture location';
  if (locating) {
    locationButtonLabel = 'Getting location…';
  } else if (location) {
    locationButtonLabel = 'Retake location';
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
    if (!canSave) {
      return;
    }
    const record = addRecord({
      speciesName: species.trim(),
      commonName: commonName.trim() || undefined,
      heightM: height.value,
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
      title="New plant record"
      subtitle="Fill in what you can. Only the species is required.">
      <Card title="Plant" icon="leaf">
        <Field
          label="Species"
          required
          value={species}
          onChangeText={setSpecies}
          onBlur={() => setTouched((current) => ({ ...current, species: true }))}
          autoCorrect={false}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => commonNameRef.current?.focus()}
          hint="Scientific name, like Shorea macrophylla"
          error={touched.species && speciesMissing ? 'Add the species name.' : undefined}
        />
        <Field
          ref={commonNameRef}
          label="Common name"
          value={commonName}
          onChangeText={setCommonName}
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
          error={
            touched.height && !height.valid
              ? `Enter a height in metres between 0 and ${MAX_HEIGHT_M}, like 12.5`
              : undefined
          }
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
          placeholder="Damage, flowering, fruit, nearby threats"
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
        <Button label="Save record" onPress={save} disabled={!canSave} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.saveHint}>
          {saveHint}
        </ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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

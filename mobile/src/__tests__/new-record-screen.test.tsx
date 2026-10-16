import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import NewRecordScreen from '@/app/(tabs)/new-record';
import RecordScreen from '@/app/record/[id]';
import { RecordsProvider, useRecords } from '@/state/records-context';
import type { PlantRecord } from '@/types/plant-record';

// Hands the records list to the test, so it can check what was saved behind the screen.
const onRecords = jest.fn<void, [PlantRecord[]]>();

function RecordsSpy() {
  onRecords(useRecords().records);
  return null;
}

function TestLayout() {
  return (
    <RecordsProvider>
      <RecordsSpy />
      <Stack />
    </RecordsProvider>
  );
}

function renderForm() {
  return renderRouter(
    { _layout: TestLayout, 'new-record': NewRecordScreen, 'record/[id]': RecordScreen },
    { initialUrl: '/new-record' },
  );
}

function newestRecord() {
  return onRecords.mock.lastCall?.[0][0];
}

const speciesBox = () => screen.getByLabelText('Species, required');
const commonNameBox = () => screen.getByLabelText('Common name');
const heightBox = () => screen.getByLabelText('Height');
const saveButton = () => screen.getByRole('button', { name: 'Save record' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('New record screen', () => {
  it('keeps Save turned off until there is a species', () => {
    renderForm();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Add the species name to save.')).toBeVisible();

    fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
    expect(saveButton()).toBeEnabled();
  });

  it('shows the species error once you leave the box empty', () => {
    renderForm();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent(speciesBox(), 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Add the species name.');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Add the species name.',
    );
  });

  it('suggests species while typing and fills in the common name', () => {
    renderForm();
    fireEvent.changeText(speciesBox(), 'shor');
    expect(screen.getByText("Tap a match below, or keep typing if it isn't there.")).toBeVisible();

    fireEvent.press(screen.getByRole('button', { name: 'Use Shorea macrophylla, Engkabang' }));
    expect(speciesBox()).toHaveDisplayValue('Shorea macrophylla');
    expect(commonNameBox()).toHaveDisplayValue('Engkabang');
    expect(screen.getByText('On the species list.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
  });

  it('keeps a common name that was already typed when a species is picked', () => {
    renderForm();
    fireEvent.changeText(commonNameBox(), 'Kawang');
    fireEvent.changeText(speciesBox(), 'engk');
    fireEvent.press(screen.getByRole('button', { name: 'Use Shorea macrophylla, Engkabang' }));
    expect(commonNameBox()).toHaveDisplayValue('Kawang');
  });

  it('turns down a height with too many decimals', () => {
    renderForm();
    fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
    fireEvent.changeText(heightBox(), '12.345');
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent(heightBox(), 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Use 2 decimal places at most, like 12.25');
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Fix the height to save.')).toBeVisible();

    fireEvent.changeText(heightBox(), '12.35');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saveButton()).toBeEnabled();
  });

  it('counts down the characters left in the notes', () => {
    renderForm();
    const notesBox = screen.getByLabelText('Notes');
    fireEvent.changeText(notesBox, 'a'.repeat(899));
    expect(screen.queryByText(/characters? left$/)).toBeNull();

    fireEvent.changeText(notesBox, 'a'.repeat(950));
    expect(screen.getByText('50 characters left')).toBeVisible();

    fireEvent.changeText(notesBox, 'a'.repeat(999));
    expect(screen.getByText('1 character left')).toBeVisible();
  });

  it('saves a species picked from the list and opens the new record', () => {
    const app = renderForm();
    fireEvent.changeText(speciesBox(), 'ironwood');
    fireEvent.press(screen.getByRole('button', { name: 'Use Eusideroxylon zwageri, Belian' }));
    fireEvent.changeText(heightBox(), ' 12,5 ');
    fireEvent.press(screen.getByRole('radio', { name: 'Damaged' }));
    fireEvent.changeText(screen.getByLabelText('Notes'), '  Bark stripped on one side  ');
    fireEvent.press(saveButton());

    const saved = newestRecord();
    expect(saved).toMatchObject({
      speciesName: 'Eusideroxylon zwageri',
      speciesSlug: 'eusideroxylon-zwageri',
      commonName: 'Belian',
      heightM: 12.5,
      condition: 'damaged',
      notes: 'Bark stripped on one side',
      syncStatus: 'pending',
    });
    expect(saved?.location).toBeUndefined();

    expect(app.getPathname()).toBe(`/record/${saved?.id}`);
    expect(screen.getByText(`Tag ${saved?.tagCode}`)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Eusideroxylon zwageri' })).toBeVisible();
  });

  it('links a species name typed out in full, in any case', () => {
    renderForm();
    fireEvent.changeText(speciesBox(), '  nepenthes   AMPULLARIA ');
    expect(screen.getByText('On the species list.')).toBeVisible();
    fireEvent.press(saveButton());

    expect(newestRecord()).toMatchObject({
      speciesName: 'Nepenthes ampullaria',
      speciesSlug: 'nepenthes-ampullaria',
    });
  });

  it('still saves a species that is not on the list, just without a link', () => {
    renderForm();
    fireEvent.changeText(speciesBox(), '  Ficus   sp. ');
    expect(screen.getByText('Not on the species list. You can still save it.')).toBeVisible();
    fireEvent.changeText(commonNameBox(), '   ');
    fireEvent.press(saveButton());

    const saved = newestRecord();
    expect(saved?.speciesName).toBe('Ficus sp.');
    expect(saved?.speciesSlug).toBeUndefined();
    expect(saved?.commonName).toBeUndefined();
    expect(saved?.heightM).toBeUndefined();
    expect(saved?.condition).toBe('healthy');
  });

  it('starts the next record with an empty form', () => {
    const app = renderForm();
    fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
    fireEvent(speciesBox(), 'blur');
    fireEvent.changeText(commonNameBox(), 'Engkabang');
    fireEvent.changeText(heightBox(), '30');
    fireEvent.press(screen.getByRole('radio', { name: 'Dead' }));
    fireEvent.press(saveButton());
    expect(app.getPathname()).toBe(`/record/${newestRecord()?.id}`);

    testRouter.back('/new-record');
    expect(speciesBox()).toHaveDisplayValue('');
    expect(commonNameBox()).toHaveDisplayValue('');
    expect(heightBox()).toHaveDisplayValue('');
    expect(screen.getByRole('radio', { name: 'Healthy' })).toBeChecked();
    // The species box was left once already, but the new form shouldn't start with an error.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saveButton()).toBeDisabled();
  });
});

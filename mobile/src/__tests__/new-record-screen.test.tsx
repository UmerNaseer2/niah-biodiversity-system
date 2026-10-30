import * as Location from 'expo-location';
import { Stack } from 'expo-router';
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
  waitFor,
} from 'expo-router/testing-library';
import { deleteDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';
import { AccessibilityInfo, Linking } from 'react-native';

import NewRecordScreen from '@/app/(tabs)/new-record';
import RecordScreen from '@/app/record/[id]';
import { MOCK_RECORDS } from '@/data/mock-records';
import { DATABASE_NAME } from '@/db/database';
import { openRecordsStore } from '@/db/records-store';
import { RecordsProvider, useRecords } from '@/state/records-context';
import type { PlantRecord } from '@/types/plant-record';

jest.mock('expo-location');

const getPermission = jest.mocked(Location.getForegroundPermissionsAsync);
const watchPosition = jest.mocked(Location.watchPositionAsync);

const granted: Location.LocationPermissionResponse = {
  status: Location.PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
};

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

/** Opens the form once the records saved on the phone have loaded. */
async function renderForm() {
  const app = renderRouter(
    { _layout: TestLayout, 'new-record': NewRecordScreen, 'record/[id]': RecordScreen },
    { initialUrl: '/new-record' },
  );
  await screen.findByLabelText('Species, required');
  return app;
}

function newestRecord() {
  return onRecords.mock.lastCall?.[0][0];
}

const speciesBox = () => screen.getByLabelText('Species, required');
const commonNameBox = () => screen.getByLabelText('Common name');
// The "m" drawn in the box is hidden from screen readers, so the unit is part of the label.
const heightBox = () => screen.getByLabelText('Height, in metres');
const saveButton = () => screen.getByRole('button', { name: 'Save record' });

/** Presses Capture location and waits until the phone is looking for satellites. */
async function startCapture() {
  fireEvent.press(screen.getByRole('button', { name: 'Capture location' }));
  expect(await screen.findByText('Looking for GPS satellites…')).toBeVisible();
}

/** Sends a GPS fix the way expo-location would. A made-up point near the park HQ. */
function sendFix(accuracy: number) {
  const onLocation = watchPosition.mock.lastCall?.[1];
  act(() => {
    onLocation?.({
      coords: {
        latitude: 3.81452,
        longitude: 113.77921,
        altitude: null,
        accuracy,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });
  });
}

async function captureLocation() {
  await startCapture();
  sendFix(4.6);
}

/** Presses Save and waits for the new record to open, which happens once it's on the phone. */
async function saveAndOpen() {
  fireEvent.press(saveButton());
  expect(await screen.findByText(/^Tag NNP-[0-9A-F]{6}$/)).toBeVisible();
}

beforeEach(async () => {
  jest.clearAllMocks();
  getPermission.mockResolvedValue(granted);
  jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
  watchPosition.mockResolvedValue({ remove: jest.fn() });
  // Every test starts with nothing saved on the phone.
  await deleteDatabaseAsync(DATABASE_NAME);
});

describe('New record screen', () => {
  it('keeps Save turned off until there is a species and a location', async () => {
    await renderForm();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Add the species name to save.')).toBeVisible();

    fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Capture the location to save.')).toBeVisible();

    await startCapture();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Waiting for the location…')).toBeVisible();

    sendFix(4.6);
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText('Saved on this phone first. It uploads when you sync.')).toBeVisible();
  });

  it('shows the species error once you leave the box empty', async () => {
    await renderForm();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent(speciesBox(), 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Add the species name.');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Add the species name.',
    );
  });

  it('suggests species while typing and fills in the common name', async () => {
    await renderForm();
    fireEvent.changeText(speciesBox(), 'shor');
    expect(screen.getByText("Tap a match below, or keep typing if it isn't there.")).toBeVisible();

    fireEvent.press(screen.getByRole('button', { name: 'Use Shorea macrophylla, Engkabang' }));
    expect(speciesBox()).toHaveDisplayValue('Shorea macrophylla');
    expect(commonNameBox()).toHaveDisplayValue('Engkabang');
    expect(screen.getByText('On the species list.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
  });

  it('suggests and links species from the list downloaded at the last sync', async () => {
    // A species added on the website after the app came out. Names only.
    const store = await openRecordsStore();
    try {
      await store.replaceSpecies([
        {
          slug: 'ficus-benjamina',
          scientificName: 'Ficus benjamina',
          commonNames: ['Weeping fig'],
        },
      ]);
    } finally {
      await store.close();
    }

    await renderForm();
    fireEvent.changeText(speciesBox(), 'weep');
    fireEvent.press(screen.getByRole('button', { name: 'Use Ficus benjamina, Weeping fig' }));
    expect(commonNameBox()).toHaveDisplayValue('Weeping fig');
    expect(screen.getByText('On the species list.')).toBeVisible();
    await captureLocation();
    await saveAndOpen();

    expect(newestRecord()).toMatchObject({
      speciesName: 'Ficus benjamina',
      speciesSlug: 'ficus-benjamina',
      commonName: 'Weeping fig',
    });
  });

  it('picks a species with no common names without filling in a blank one', async () => {
    // The website lets a species go on the list before anyone has added a common name.
    const store = await openRecordsStore();
    try {
      await store.replaceSpecies([
        { slug: 'ficus-aurantiacea', scientificName: 'Ficus aurantiacea', commonNames: [] },
      ]);
    } finally {
      await store.close();
    }

    await renderForm();
    fireEvent.changeText(speciesBox(), 'aurant');
    fireEvent.press(screen.getByRole('button', { name: 'Use Ficus aurantiacea' }));
    expect(speciesBox()).toHaveDisplayValue('Ficus aurantiacea');
    expect(commonNameBox()).toHaveDisplayValue('');
    expect(screen.getByText('On the species list.')).toBeVisible();
    await captureLocation();
    await saveAndOpen();

    const saved = newestRecord();
    expect(saved).toMatchObject({
      speciesName: 'Ficus aurantiacea',
      speciesSlug: 'ficus-aurantiacea',
    });
    expect(saved?.commonName).toBeUndefined();
  });

  it('keeps a common name that was already typed when a species is picked', async () => {
    await renderForm();
    fireEvent.changeText(commonNameBox(), 'Kawang');
    fireEvent.changeText(speciesBox(), 'engk');
    fireEvent.press(screen.getByRole('button', { name: 'Use Shorea macrophylla, Engkabang' }));
    expect(commonNameBox()).toHaveDisplayValue('Kawang');
  });

  it('turns down a height with too many decimals', async () => {
    await renderForm();
    await captureLocation();
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

  it('counts down the characters left in the notes', async () => {
    await renderForm();
    const notesBox = screen.getByLabelText('Notes');
    fireEvent.changeText(notesBox, 'a'.repeat(899));
    expect(screen.queryByText(/characters? left$/)).toBeNull();

    fireEvent.changeText(notesBox, 'a'.repeat(950));
    expect(screen.getByText('50 characters left')).toBeVisible();

    fireEvent.changeText(notesBox, 'a'.repeat(999));
    expect(screen.getByText('1 character left')).toBeVisible();
  });

  it('saves a species picked from the list and opens the new record', async () => {
    const app = await renderForm();
    fireEvent.changeText(speciesBox(), 'ironwood');
    fireEvent.press(screen.getByRole('button', { name: 'Use Eusideroxylon zwageri, Belian' }));
    fireEvent.changeText(heightBox(), ' 12,5 ');
    fireEvent.press(screen.getByRole('radio', { name: 'Damaged' }));
    fireEvent.changeText(screen.getByLabelText('Notes'), '  Bark stripped on one side  ');
    await captureLocation();
    await saveAndOpen();

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
    expect(saved?.location).toEqual({
      latitude: 3.81452,
      longitude: 113.77921,
      accuracyM: 5,
      capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });

    expect(app.getPathname()).toBe(`/record/${saved?.id}`);
    expect(screen.getByText(`Tag ${saved?.tagCode}`)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Eusideroxylon zwageri' })).toBeVisible();
    expect(screen.getByText('3.81452° N, 113.77921° E')).toBeVisible();

    // It's in the database on the phone as well, so it's still there after a restart.
    const store = await openRecordsStore();
    try {
      expect(await store.loadRecords()).toEqual([saved]);
    } finally {
      await store.close();
    }
  });

  it('links a species name typed out in full, in any case', async () => {
    await renderForm();
    fireEvent.changeText(speciesBox(), '  nepenthes   AMPULLARIA ');
    expect(screen.getByText('On the species list.')).toBeVisible();
    await captureLocation();
    await saveAndOpen();

    expect(newestRecord()).toMatchObject({
      speciesName: 'Nepenthes ampullaria',
      speciesSlug: 'nepenthes-ampullaria',
    });
  });

  it('still saves a species that is not on the list, just without a link', async () => {
    await renderForm();
    fireEvent.changeText(speciesBox(), '  Ficus   sp. ');
    expect(screen.getByText('Not on the species list. You can still save it.')).toBeVisible();
    fireEvent.changeText(commonNameBox(), '   ');
    await captureLocation();
    await saveAndOpen();

    const saved = newestRecord();
    expect(saved?.speciesName).toBe('Ficus sp.');
    expect(saved?.speciesSlug).toBeUndefined();
    expect(saved?.commonName).toBeUndefined();
    expect(saved?.heightM).toBeUndefined();
    expect(saved?.condition).toBe('healthy');
  });

  it('starts the next record with an empty form', async () => {
    const app = await renderForm();
    fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
    fireEvent(speciesBox(), 'blur');
    fireEvent.changeText(commonNameBox(), 'Engkabang');
    fireEvent.changeText(heightBox(), '30');
    fireEvent.press(screen.getByRole('radio', { name: 'Dead' }));
    await captureLocation();
    await saveAndOpen();
    expect(app.getPathname()).toBe(`/record/${newestRecord()?.id}`);

    testRouter.back('/new-record');
    expect(speciesBox()).toHaveDisplayValue('');
    expect(commonNameBox()).toHaveDisplayValue('');
    expect(heightBox()).toHaveDisplayValue('');
    expect(screen.getByRole('radio', { name: 'Healthy' })).toBeChecked();
    // The next plant is somewhere else, so the location has to be captured again.
    expect(screen.getByRole('button', { name: 'Capture location' })).toBeVisible();
    // The species box was left once already, but the new form shouldn't start with an error.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saveButton()).toBeDisabled();
  });

  it("keeps everything in the form when the record can't be saved", async () => {
    const insert = jest
      .spyOn(SQLiteDatabase.prototype, 'runAsync')
      .mockRejectedValueOnce(new Error('database or disk is full'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const app = await renderForm();
      fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
      fireEvent.changeText(heightBox(), '12.5');
      await captureLocation();
      fireEvent.press(saveButton());

      const message = "Couldn't save the record on this phone. Try again.";
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
      expect(warn).toHaveBeenCalledWith("Couldn't save the record.", expect.any(Error));
      expect(app.getPathname()).toBe('/new-record');
      expect(speciesBox()).toHaveDisplayValue('Shorea macrophylla');
      expect(heightBox()).toHaveDisplayValue('12.5');
      expect(screen.getByText('±5 m · Good')).toBeVisible();
      expect(onRecords.mock.lastCall?.[0]).toHaveLength(MOCK_RECORDS.length);

      // Nothing has to be typed again. Save works once the phone has room.
      expect(saveButton()).toBeEnabled();
      await saveAndOpen();
      expect(newestRecord()).toMatchObject({ speciesName: 'Shorea macrophylla', heightM: 12.5 });
    } finally {
      insert.mockRestore();
      warn.mockRestore();
    }
  });

  it('takes the save error away once something in the form is changed', async () => {
    const insert = jest
      .spyOn(SQLiteDatabase.prototype, 'runAsync')
      .mockRejectedValueOnce(new Error('database or disk is full'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await renderForm();
      fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
      await captureLocation();
      fireEvent.press(saveButton());
      const message = "Couldn't save the record on this phone. Try again.";
      expect(await screen.findByRole('alert')).toHaveTextContent(message);

      fireEvent.changeText(screen.getByLabelText('Notes'), 'Two seedlings nearby');
      expect(screen.queryByText(message)).toBeNull();
    } finally {
      insert.mockRestore();
      warn.mockRestore();
    }
  });

  it('saves once when Save is tapped twice quickly', async () => {
    const insert = jest.spyOn(SQLiteDatabase.prototype, 'runAsync');
    try {
      await renderForm();
      fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
      await captureLocation();
      // Both taps land before the screen has redrawn Save as turned off.
      act(() => {
        fireEvent.press(saveButton());
        fireEvent.press(saveButton());
      });
      expect(await screen.findByText(/^Tag NNP-[0-9A-F]{6}$/)).toBeVisible();
      expect(insert).toHaveBeenCalledTimes(1);
      expect(onRecords.mock.lastCall?.[0]).toHaveLength(MOCK_RECORDS.length + 1);
    } finally {
      insert.mockRestore();
    }
  });

  it('shows a rough fix while it improves, and lets you use it early', async () => {
    await renderForm();
    fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
    await startCapture();
    sendFix(17.2);
    expect(screen.getByText('Improving the fix…')).toBeVisible();
    expect(screen.getByText('±18 m · OK')).toBeVisible();
    expect(saveButton()).toBeDisabled();

    fireEvent.press(screen.getByRole('button', { name: 'Use this location' }));
    expect(screen.getByRole('button', { name: 'Retake location' })).toBeVisible();
    expect(saveButton()).toBeEnabled();

    await saveAndOpen();
    expect(newestRecord()?.location?.accuracyM).toBe(18);
  });

  it('turns the GPS off when another screen opens on top', async () => {
    const remove = jest.fn();
    watchPosition.mockResolvedValue({ remove });
    await renderForm();
    await startCapture();

    const other = MOCK_RECORDS[0];
    testRouter.push(`/record/${other.id}`);
    expect(await screen.findByText(`Tag ${other.tagCode}`)).toBeVisible();
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));

    // Coming back leaves it off until Capture location is pressed again.
    testRouter.back('/new-record');
    expect(screen.getByRole('button', { name: 'Capture location' })).toBeVisible();
    expect(watchPosition).toHaveBeenCalledTimes(1);
  });

  it('tells screen reader users when the location is captured', async () => {
    await renderForm();
    await captureLocation();
    expect(screen.getByText('±5 m · Good')).toBeVisible();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Location captured, accurate to about 5 metres.',
    );
  });

  it('points to Settings when location access is turned off', async () => {
    getPermission.mockResolvedValue({
      ...granted,
      status: Location.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
    });
    const openSettings = jest.mocked(Linking.openSettings).mockResolvedValue(undefined);
    await renderForm();
    fireEvent.changeText(speciesBox(), 'Shorea macrophylla');
    fireEvent.press(screen.getByRole('button', { name: 'Capture location' }));

    const message = 'Location access is off for this app. Turn it on in Settings, then try again.';
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
    expect(watchPosition).not.toHaveBeenCalled();
    expect(screen.getByText('Capture the location to save.')).toBeVisible();

    fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

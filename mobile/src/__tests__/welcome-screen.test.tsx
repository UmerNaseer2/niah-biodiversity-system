import { Text } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';
import * as SQLite from 'expo-sqlite';

import RootLayout, { unstable_settings } from '@/app/_layout';
import TabLayout from '@/app/(tabs)/_layout';
import HomeScreen from '@/app/(tabs)/index';
import ProfileScreen from '@/app/(tabs)/profile';
import WelcomeScreen from '@/app/welcome';
import { MOCK_RECORDS } from '@/data/mock-records';
import { DATABASE_NAME, openDatabase } from '@/db/database';
import { openRecordsStore } from '@/db/records-store';
import { SWITCH_FAILED } from '@/hooks/use-switch-mode';
import type { AppMode } from '@/types/app-mode';
import type { PlantRecord } from '@/types/plant-record';

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const VISITOR_TABS = ['Home', 'Scan', 'Plants', 'History', 'Settings'];
const STAFF_TABS = ['Home', 'Scan', 'New Record', 'My Records', 'Profile'];

// A record with no location, so the phone has something saved from before visitors could pick.
const oldRecord: PlantRecord = {
  id: 'c2d4f6a8-1b3d-4f5a-8c7e-9a0b1c2d3e40',
  tagCode: 'NNP-C2D4F6',
  speciesName: 'Ficus sp.',
  condition: 'healthy',
  photoCount: 0,
  recordedAt: '2026-10-16T00:40:00.000Z',
  syncStatus: 'pending',
};

function StandIn({ name }: { name: string }) {
  return <Text>{name}</Text>;
}

// The real root layout, welcome page, tab bar, Home and Profile. The other pages have their own
// tests, and some need the camera or GPS, so simple stand-ins take their place.
function renderApp(initialUrl = '/') {
  return renderRouter(
    {
      _layout: { default: RootLayout, unstable_settings },
      welcome: WelcomeScreen,
      '(tabs)/_layout': TabLayout,
      '(tabs)/index': HomeScreen,
      '(tabs)/scan': () => <StandIn name="Scan page" />,
      '(tabs)/new-record': () => <StandIn name="New record page" />,
      '(tabs)/records': () => <StandIn name="Records page" />,
      '(tabs)/plants': () => <StandIn name="Plants page" />,
      '(tabs)/history': () => <StandIn name="History page" />,
      '(tabs)/profile': ProfileScreen,
      'record/[id]': () => <StandIn name="Record page" />,
      'plant/[tag]': () => <StandIn name="Plant page" />,
      'species/[slug]': () => <StandIn name="Species page" />,
    },
    { initialUrl },
  );
}

type TreeNode = {
  type: string;
  props: Record<string, unknown>;
  children: (TreeNode | string)[] | null;
};

// The native tab bar only shows up in Jest as one screen per tab, each with the tab's title.
function tabTitles() {
  const titles: string[] = [];
  function walk(node: TreeNode | string | null) {
    if (node === null || typeof node === 'string') {
      return;
    }
    if (node.type === 'RNSTabsScreenIOS') {
      titles.push(String(node.props.title));
    }
    node.children?.forEach(walk);
  }
  const tree = screen.toJSON() as TreeNode | TreeNode[] | null;
  (Array.isArray(tree) ? tree : [tree]).forEach(walk);
  return titles;
}

// Waits for the button first, since the app holds back its pages until the phone's data loads.
async function pick(choice: RegExp) {
  const button = await screen.findByRole('button', { name: choice });
  await act(async () => {
    fireEvent.press(button);
  });
}

// Saves a pick made the last time the app was open.
async function savePick(mode: AppMode) {
  const store = await openRecordsStore();
  await store.saveMode(mode);
  await store.close();
}

beforeEach(async () => {
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('on a new phone', () => {
  it('asks who is using the app before showing any tabs', async () => {
    renderApp();
    expect(await screen.findByText('Welcome')).toBeVisible();
    expect(screen.getByRole('button', { name: /^I'm visiting the park/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^I work at the park/ })).toBeVisible();
    expect(tabTitles()).toEqual([]);
  });

  it('gives a visitor the plant guide and no tabs for making records', async () => {
    renderApp();
    await pick(/^I'm visiting the park/);
    expect(await screen.findByText('Plant guide')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Scan a plant tag' })).toBeVisible();
    expect(tabTitles()).toEqual(VISITOR_TABS);
    expect(screen.queryByText('Welcome')).toBeNull();
  });

  it('gives staff the same tabs as before', async () => {
    renderApp();
    await pick(/^I work at the park/);
    expect(await screen.findByText('Ground-truthing')).toBeVisible();
    expect(tabTitles()).toEqual(STAFF_TABS);
  });

  it('ignores a second tap that lands before the first pick is saved', async () => {
    renderApp();
    const visiting = await screen.findByRole('button', { name: /^I'm visiting the park/ });
    const working = screen.getByRole('button', { name: /^I work at the park/ });
    // Both taps go in before the page can redraw, like a quick double tap on the phone.
    await act(async () => {
      fireEvent.press(visiting);
      fireEvent.press(working);
    });
    expect(await screen.findByText('Plant guide')).toBeVisible();
    expect(tabTitles()).toEqual(VISITOR_TABS);
  });

  it('remembers the pick the next time the app opens', async () => {
    renderApp();
    await pick(/^I'm visiting the park/);
    await screen.findByText('Plant guide');
    screen.unmount();

    renderApp();
    expect(await screen.findByText('Plant guide')).toBeVisible();
    expect(screen.queryByText('Welcome')).toBeNull();
  });

  it("says so when the pick can't be saved, and lets them try again", async () => {
    renderApp();
    await screen.findByText('Welcome');
    // The app has finished loading by now, so the only write that fails is saving the pick.
    jest
      .spyOn(SQLite.SQLiteDatabase.prototype, 'runAsync')
      .mockRejectedValueOnce(new Error('database or disk is full'));
    await pick(/^I'm visiting the park/);
    expect(await screen.findByRole('alert')).toHaveTextContent(SWITCH_FAILED);
    expect(console.warn).toHaveBeenCalledWith(
      "Couldn't save who uses this phone.",
      expect.any(Error),
    );
    expect(screen.getByText('Welcome')).toBeVisible();
    expect(screen.getByRole('button', { name: /^I'm visiting the park/ })).toBeEnabled();

    await pick(/^I'm visiting the park/);
    expect(await screen.findByText('Plant guide')).toBeVisible();
  });
});

describe('on a phone that was used before visitors could pick', () => {
  it('opens straight to the staff tabs when records are saved on it', async () => {
    const store = await openRecordsStore();
    await store.saveRecord(oldRecord);
    await store.close();

    renderApp();
    expect(await screen.findByText('Ground-truthing')).toBeVisible();
    expect(screen.queryByText('Welcome')).toBeNull();
    expect(tabTitles()).toEqual(STAFF_TABS);
  });

  it('opens straight to the staff tabs when it has synced before', async () => {
    const store = await openRecordsStore();
    await store.saveLastSynced('2026-11-01T01:00:00.000Z');
    await store.close();

    renderApp();
    expect(await screen.findByText('Ground-truthing')).toBeVisible();
    expect(screen.queryByText('Welcome')).toBeNull();
  });

  it('stays a staff phone after its old records are gone', async () => {
    const store = await openRecordsStore();
    await store.saveRecord(oldRecord);
    await store.close();
    renderApp();
    await screen.findByText('Ground-truthing');
    screen.unmount();

    // Development builds always list a few sample records that aren't saved, so this checks the
    // database itself to know the saved one is gone.
    const db = await openDatabase();
    expect((await db.runAsync('DELETE FROM plant_records')).changes).toBe(1);
    await db.closeAsync();

    renderApp();
    expect(await screen.findByText('Ground-truthing')).toBeVisible();
    expect(screen.queryByText('Welcome')).toBeNull();
  });

  it("still opens to the staff tabs when it can't save that it's a staff phone", async () => {
    const store = await openRecordsStore();
    await store.saveRecord(oldRecord);
    await store.close();
    // Saving that it's a staff phone is the first write while the app opens.
    jest
      .spyOn(SQLite.SQLiteDatabase.prototype, 'runAsync')
      .mockRejectedValueOnce(new Error('database or disk is full'));

    renderApp();
    expect(await screen.findByText('Ground-truthing')).toBeVisible();
    expect(console.warn).toHaveBeenCalledWith(
      "Couldn't save that this phone is used by staff.",
      expect.any(Error),
    );
    expect(screen.queryByText('Welcome')).toBeNull();
  });
});

describe('switching later', () => {
  it('lets a visitor switch to staff from Settings', async () => {
    renderApp();
    await pick(/^I'm visiting the park/);
    await screen.findByText('Plant guide');
    act(() => router.navigate('/profile'));
    expect(await screen.findByText('Work at the park?')).toBeVisible();

    await pick(/^I work at the park/);
    expect(tabTitles()).toEqual(STAFF_TABS);
    // This build has no server settings, so the staff profile says sign in isn't set up.
    expect(await screen.findByText(/Sign in isn't set up in this build/)).toBeVisible();
    expect(screen.queryByText('Work at the park?')).toBeNull();
  });

  it('lets signed out staff switch to visitor from Profile', async () => {
    renderApp();
    await pick(/^I work at the park/);
    await screen.findByText('Ground-truthing');
    act(() => router.navigate('/profile'));
    expect(await screen.findByText('Visiting the park?')).toBeVisible();

    await pick(/^I'm visiting the park/);
    expect(tabTitles()).toEqual(VISITOR_TABS);
    expect(await screen.findByText('Work at the park?')).toBeVisible();
  });
});

// The tab bar leaves out the tabs a mode doesn't get, and the root stack leaves out the pages it
// doesn't get, so a link to one of them opens Home instead.
describe('links to pages for the other mode', () => {
  it("won't open New Record, My Records or a staff record for a visitor", async () => {
    const app = renderApp();
    await pick(/^I'm visiting the park/);
    await screen.findByText('Plant guide');

    act(() => router.navigate('/new-record'));
    expect(app.getPathname()).toBe('/');
    act(() => router.navigate('/records'));
    expect(app.getPathname()).toBe('/');
    // Development builds list the sample records, so this record is on the phone.
    act(() => router.navigate({ pathname: '/record/[id]', params: { id: MOCK_RECORDS[0].id } }));
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('Plant guide')).toBeVisible();
    expect(screen.queryByText('New record page')).toBeNull();
    expect(screen.queryByText('Records page')).toBeNull();
    expect(screen.queryByText('Record page')).toBeNull();

    // A tab visitors do get still opens, so the links above really were turned away.
    act(() => router.navigate('/plants'));
    expect(app.getPathname()).toBe('/plants');
  });

  it("won't open Plants or History for staff", async () => {
    const app = renderApp();
    await pick(/^I work at the park/);
    await screen.findByText('Ground-truthing');

    act(() => router.navigate('/plants'));
    expect(app.getPathname()).toBe('/');
    act(() => router.navigate('/history'));
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('Ground-truthing')).toBeVisible();
    expect(screen.queryByText('Plants page')).toBeNull();
    expect(screen.queryByText('History page')).toBeNull();

    act(() => router.navigate('/records'));
    expect(app.getPathname()).toBe('/records');
  });

  it.each([
    { page: 'New Record', link: '/new-record' },
    { page: 'My Records', link: '/records' },
    { page: 'a staff record', link: `/record/${MOCK_RECORDS[0].id}` },
    { page: 'the welcome page', link: '/welcome' },
  ])('opens Home for a visitor when a link to $page opens the app', async ({ link }) => {
    await savePick('visitor');
    const app = renderApp(link);
    expect(await screen.findByText('Plant guide')).toBeVisible();
    expect(app.getPathname()).toBe('/');
    expect(tabTitles()).toEqual(VISITOR_TABS);
  });

  it.each([
    { page: 'Plants', link: '/plants' },
    { page: 'History', link: '/history' },
    { page: 'the welcome page', link: '/welcome' },
  ])('opens Home for staff when a link to $page opens the app', async ({ link }) => {
    await savePick('staff');
    const app = renderApp(link);
    expect(await screen.findByText('Ground-truthing')).toBeVisible();
    expect(app.getPathname()).toBe('/');
    expect(tabTitles()).toEqual(STAFF_TABS);
  });

  it('asks who is using the app first when a link opens it on a new phone', async () => {
    const app = renderApp('/plant/NNP-A1B2C3');
    expect(await screen.findByText('Welcome')).toBeVisible();
    expect(screen.queryByText('Plant page')).toBeNull();

    await pick(/^I'm visiting the park/);
    expect(await screen.findByText('Plant guide')).toBeVisible();
    expect(app.getPathname()).toBe('/');
  });
});

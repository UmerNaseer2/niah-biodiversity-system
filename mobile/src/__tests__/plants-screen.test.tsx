import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { Text, TextInput } from 'react-native';

import PlantsScreen from '@/app/(tabs)/plants';
import { usePublicCopy } from '@/state/public-copy-context';
import { useRecords } from '@/state/records-context';
import type { PublicPhoto, PublicRecord, PublicSpecies } from '@/types/public-copy';

// The Plants tab, with the plant info saved on the phone swapped for made-up plants. The
// matching and sorting themselves are tested in lib/__tests__/species-list.test.ts.

jest.mock('@/state/records-context', () => ({ useRecords: jest.fn() }));
jest.mock('@/state/public-copy-context', () => ({ usePublicCopy: jest.fn() }));

type CopyState = ReturnType<typeof usePublicCopy>;

const SUBTITLE =
  'Every species our field teams have recorded at Niah so far. Search by common name, ' +
  'Latin name or family.';
const SPELLING_HINT = 'Check the spelling, or try the Latin name or the family instead.';
const GETTING_READY = 'Getting plant info ready for offline use...';
const DOWNLOADED = '2026-11-04T06:15:00.000Z';

// Made-up plant info. Like the real copy, the plants have no location.
function makeSpecies(
  changes: Partial<PublicSpecies> & Pick<PublicSpecies, 'slug' | 'scientificName'>,
): PublicSpecies {
  return {
    authority: '',
    family: '',
    commonNames: [],
    iucnCode: 'NE',
    sarawakProtected: false,
    summary: '',
    about: '',
    habitat: '',
    uses: '',
    ...changes,
  };
}

const PITCHER = makeSpecies({
  slug: 'nepenthes-rafflesiana',
  scientificName: 'Nepenthes rafflesiana',
  family: 'Nepenthaceae',
  commonNames: ['Raffles pitcher plant', 'Periuk kera'],
  iucnCode: 'LC',
  sarawakProtected: true,
});

const BELIAN = makeSpecies({
  slug: 'eusideroxylon-zwageri',
  scientificName: 'Eusideroxylon zwageri',
  family: 'Lauraceae',
  commonNames: ['Belian', 'Borneo ironwood'],
  iucnCode: 'VU',
});

const KAPUR = makeSpecies({
  slug: 'dryobalanops-aromatica',
  scientificName: 'Dryobalanops aromatica',
  family: 'Dipterocarpaceae',
  commonNames: ['Kapur', 'Borneo camphor'],
  iucnCode: 'CR',
});

// A species added on the website with only its name and status filled in so far.
const BENJAMINA = makeSpecies({ slug: 'ficus-benjamina', scientificName: 'Ficus benjamina' });

const PLANTS: PublicRecord[] = [
  {
    id: 'e1a2b3c4-5d6e-4f70-8a9b-0c1d2e3f4a51',
    tagCode: 'NNP-E1A2B3',
    speciesSlug: 'nepenthes-rafflesiana',
    speciesName: 'Nepenthes rafflesiana',
    commonName: 'Raffles pitcher plant',
    recordedAt: '2026-10-20T02:30:00.000Z',
  },
  {
    id: '4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c71',
    tagCode: 'NNP-4A5B6C',
    speciesSlug: 'nepenthes-rafflesiana',
    speciesName: 'Nepenthes rafflesiana',
    commonName: 'Raffles pitcher plant',
    recordedAt: '2026-10-23T03:00:00.000Z',
  },
  {
    id: '6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b93',
    tagCode: 'NNP-6F7A8B',
    speciesSlug: 'eusideroxylon-zwageri',
    speciesName: 'Eusideroxylon zwageri',
    commonName: 'Belian',
    recordedAt: '2026-10-21T01:00:00.000Z',
  },
  // Not matched to a species yet, so it gets no row and isn't counted for any species.
  {
    id: '9b8c7d6e-1f2a-4b3c-8d4e-5f6a7b8c9d02',
    tagCode: 'NNP-9B8C7D',
    speciesName: 'Ficus sp.',
    recordedAt: '2026-10-22T03:00:00.000Z',
  },
];

// The species' main photos. The pitcher plant's is saved on the phone under a made-up file name,
// and the belian's hasn't come down yet.
const PHOTOS: PublicPhoto[] = [
  {
    speciesSlug: 'nepenthes-rafflesiana',
    url:
      'https://storage.example/botanical-photos/species/nepenthes-rafflesiana/' +
      '5d0c8e2a-7b1f-4c3d-9e6a-2f4b8c1d3e5a.jpg',
    caption: 'A pitcher on its vine.',
    credit: 'Niah field team',
    file: '7f3a9c2e-4b1d-4e6f-8a2c-5d9e1b7f3a04',
  },
  {
    speciesSlug: 'eusideroxylon-zwageri',
    url:
      'https://storage.example/botanical-photos/species/eusideroxylon-zwageri/' +
      '2b6e9d1f-3a8c-4f5e-b7d2-1c4a6e8f0b39.jpg',
    caption: 'Belian bark.',
    credit: 'Niah field team',
  },
];

// What a screen reader reads out for each row, in the order the list shows them.
const KAPUR_ROW =
  'Kapur, Dryobalanops aromatica, Dipterocarpaceae family, IUCN status: Critically Endangered, ' +
  'No tagged plants yet';
const BELIAN_ROW =
  'Belian, Eusideroxylon zwageri, Lauraceae family, IUCN status: Vulnerable, 1 tagged plant';
const BENJAMINA_ROW = 'Ficus benjamina, IUCN status: Not Evaluated, No tagged plants yet';
const PITCHER_ROW =
  'Raffles pitcher plant, Nepenthes rafflesiana, Nepenthaceae family, ' +
  'IUCN status: Least Concern, protected in Sarawak, 2 tagged plants';
const ALL_ROWS = [KAPUR_ROW, BELIAN_ROW, BENJAMINA_ROW, PITCHER_ROW];

type PlantInfo = {
  species?: PublicSpecies[];
  records?: PublicRecord[];
  photos?: PublicPhoto[];
  /** When the plant info came down, or null when none has yet. */
  copyAt?: string | null;
};

/** The plant info on the phone. The species are out of order, so the list has to sort them. */
function setPlantInfo({
  species = [PITCHER, BELIAN, BENJAMINA, KAPUR],
  records = PLANTS,
  photos = PHOTOS,
  copyAt = DOWNLOADED,
}: PlantInfo = {}) {
  jest.mocked(useRecords).mockReturnValue({
    publicSpecies: species,
    publicRecords: records,
    publicPhotos: photos,
    publicCopyAt: copyAt,
  } as never);
}

function setCopy(state: Partial<CopyState> = {}) {
  jest.mocked(usePublicCopy).mockReturnValue({
    updateNow: jest.fn(async () => {}),
    running: false,
    message: null,
    lastOutcome: 'done',
    canUpdate: true,
    ...state,
  });
}

function SpeciesStandIn() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Text>Species page for {slug}</Text>;
}

function TestLayout() {
  return <Stack />;
}

async function openPlants() {
  const app = renderRouter(
    {
      _layout: TestLayout,
      plants: PlantsScreen,
      'species/[slug]': SpeciesStandIn,
    },
    { initialUrl: '/plants' },
  );
  await screen.findByRole('heading', { name: 'Plants' });
  return app;
}

/** What a screen reader reads out for each row, from the top of the list down. */
function rowLabels() {
  return screen
    .queryAllByLabelText(/, IUCN status: /)
    .map((row) => row.props.accessibilityLabel ?? row.props['aria-label']);
}

/** The line above the list that says how many plants it shows. */
function statusLine() {
  // Screen readers read it out again when it changes, so it sits in a polite live region.
  return within(screen.UNSAFE_getByProps({ 'aria-live': 'polite' }));
}

function typeSearch(text: string) {
  fireEvent.changeText(screen.getByLabelText('Search plants'), text);
}

function pickFilter(name: string) {
  fireEvent.press(screen.getByRole('radio', { name }));
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlantInfo();
  setCopy();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Plants tab', () => {
  it('lists every species by Latin name, with how many plants of each are tagged', async () => {
    await openPlants();
    expect(screen.getByText('Species list')).toBeVisible();
    expect(screen.getByText(SUBTITLE)).toBeVisible();
    expect(rowLabels()).toEqual(ALL_ROWS);
    expect(statusLine().getByText('Showing all 4 plants')).toBeVisible();
  });

  it("shows a plant's names, its status and how many of it are tagged", async () => {
    await openPlants();
    const pitcher = within(screen.getByLabelText(PITCHER_ROW));
    expect(pitcher.getByText('Raffles pitcher plant')).not.toHaveStyle({ fontStyle: 'italic' });
    expect(pitcher.getByText('Nepenthes rafflesiana · Nepenthaceae')).toBeVisible();
    expect(pitcher.getByText('Nepenthes rafflesiana')).toHaveStyle({ fontStyle: 'italic' });
    expect(pitcher.getByText('Also called Periuk kera')).toBeVisible();
    expect(pitcher.getByLabelText('IUCN status: Least Concern')).toBeVisible();
    expect(pitcher.getByText('Protected in Sarawak')).toBeVisible();
    expect(pitcher.getByText('2 tagged plants')).toBeVisible();

    const belian = within(screen.getByLabelText(BELIAN_ROW));
    expect(belian.getByText('Also called Borneo ironwood')).toBeVisible();
    expect(belian.getByLabelText('IUCN status: Vulnerable')).toBeVisible();
    expect(belian.queryByText('Protected in Sarawak')).toBeNull();
    expect(belian.getByText('1 tagged plant')).toBeVisible();
  });

  it('uses the Latin name in italics for a species with no common name', async () => {
    await openPlants();
    const fig = within(screen.getByLabelText(BENJAMINA_ROW));
    expect(fig.getByText('Ficus benjamina')).toHaveStyle({ fontStyle: 'italic' });
    // The name is the Latin name already, so it isn't shown a second time under it.
    expect(fig.getAllByText(/Ficus benjamina/)).toHaveLength(1);
    expect(fig.queryByText(/^Also called/)).toBeNull();
    expect(fig.getByLabelText('IUCN status: Not Evaluated')).toBeVisible();
    expect(fig.getByText('No tagged plants yet')).toBeVisible();
  });

  it("shows the species' photo once it's saved on the phone", async () => {
    await openPlants();
    const thumb = within(screen.getByLabelText(PITCHER_ROW)).UNSAFE_getByType(Image);
    // The photo comes from the file on the phone, never the link, so it shows with no signal.
    expect(thumb.props.source).toEqual({
      uri: 'file:///document/species-photos/7f3a9c2e-4b1d-4e6f-8a2c-5d9e1b7f3a04',
    });
    // A copy in the image cache on disk would stay behind after the photo changes.
    expect(thumb.props.cachePolicy).toBe('memory');
    // The belian's photo hasn't come down yet, and the kapur has no photo at all.
    expect(within(screen.getByLabelText(BELIAN_ROW)).UNSAFE_queryByType(Image)).toBeNull();
    expect(within(screen.getByLabelText(KAPUR_ROW)).UNSAFE_queryByType(Image)).toBeNull();
  });

  it('opens the species page from its row', async () => {
    const app = await openPlants();
    fireEvent.press(screen.getByLabelText(PITCHER_ROW));
    expect(app.getPathname()).toBe('/species/nepenthes-rafflesiana');
    expect(await screen.findByText('Species page for nepenthes-rafflesiana')).toBeVisible();
  });
});

describe('Plants search and filters', () => {
  it.each([
    ['a common name', 'borneo', [KAPUR_ROW, BELIAN_ROW], 'Showing 2 of 4 plants'],
    ['the Latin name', 'Ficus', [BENJAMINA_ROW], 'Showing 1 of 4 plants'],
    ['the family in capitals', 'NEPENTHACEAE', [PITCHER_ROW], 'Showing 1 of 4 plants'],
  ])('finds plants by %s', async (_, text, rows, status) => {
    await openPlants();
    typeSearch(text);
    expect(rowLabels()).toEqual(rows);
    expect(statusLine().getByText(status)).toBeVisible();
  });

  it('filters the list by conservation status', async () => {
    await openPlants();
    const chips = within(screen.getByLabelText('Conservation status')).getAllByRole('radio');
    expect(chips.map((chip) => chip.props.accessibilityLabel ?? chip.props['aria-label'])).toEqual(
      ['All', 'Threatened', 'Not threatened'],
    );
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();

    pickFilter('Threatened');
    expect(screen.getByRole('radio', { name: 'Threatened' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked();
    expect(rowLabels()).toEqual([KAPUR_ROW, BELIAN_ROW]);
    expect(statusLine().getByText('Showing 2 of 4 plants')).toBeVisible();

    pickFilter('Not threatened');
    expect(rowLabels()).toEqual([BENJAMINA_ROW, PITCHER_ROW]);

    pickFilter('All');
    expect(rowLabels()).toEqual(ALL_ROWS);
  });

  it('uses the search and the filter together', async () => {
    await openPlants();
    typeSearch('aceae');
    expect(rowLabels()).toEqual([KAPUR_ROW, BELIAN_ROW, PITCHER_ROW]);
    pickFilter('Not threatened');
    expect(rowLabels()).toEqual([PITCHER_ROW]);
    expect(statusLine().getByText('Showing 1 of 4 plants')).toBeVisible();
  });
});

describe('Plants with nothing to show', () => {
  it('says when nothing matches the search', async () => {
    await openPlants();
    typeSearch('  orchid ');
    expect(rowLabels()).toEqual([]);
    // The spaces around the search are left out of the heading.
    expect(screen.getByRole('heading', { name: 'Nothing matches "orchid"' })).toBeVisible();
    expect(screen.getByText(SPELLING_HINT)).toBeVisible();
    expect(statusLine().getByText('No plants match')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible();
  });

  it('says when nothing matches the filter, with no spelling hint', async () => {
    setPlantInfo({ species: [BELIAN, KAPUR], records: [] });
    await openPlants();
    pickFilter('Not threatened');
    expect(rowLabels()).toEqual([]);
    expect(screen.getByRole('heading', { name: 'No plants match this filter' })).toBeVisible();
    expect(screen.queryByText(SPELLING_HINT)).toBeNull();
    expect(statusLine().getByText('No plants match')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible();
  });

  it('clears the search and the filter, then puts the cursor back in the search box', async () => {
    await openPlants();
    pickFilter('Threatened');
    typeSearch('pitcher');
    expect(rowLabels()).toEqual([]);
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    focus.mockClear();

    fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByLabelText('Search plants')).toHaveDisplayValue('');
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(rowLabels()).toEqual(ALL_ROWS);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('says there are no plants yet when the plant info has none', async () => {
    setPlantInfo({ species: [], records: [], photos: [] });
    await openPlants();
    expect(screen.getByRole('heading', { name: 'No plants yet' })).toBeVisible();
    expect(
      screen.getByText('Plants show up here once our field teams start recording them.'),
    ).toBeVisible();
    // There's nothing to search, so the search box, the filters and the count are left out.
    expect(screen.queryByLabelText('Search plants')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.UNSAFE_queryByProps({ 'aria-live': 'polite' })).toBeNull();
  });

  it('shows how getting the plant info ready is going until it first comes down', async () => {
    setPlantInfo({ species: [], records: [], photos: [], copyAt: null });
    setCopy({ lastOutcome: null });
    await openPlants();
    expect(screen.getByText(GETTING_READY)).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'No plants yet' })).toBeNull();
    expect(screen.queryByLabelText('Search plants')).toBeNull();
  });
});

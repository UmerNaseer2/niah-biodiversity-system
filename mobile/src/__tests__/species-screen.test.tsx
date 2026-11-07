import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { Text } from 'react-native';

import SpeciesScreen from '@/app/species/[slug]';
import { formatRecordedAt, formatTime } from '@/lib/format';
import { useRecords } from '@/state/records-context';
import type { PublicPhoto, PublicRecord, PublicSpecies } from '@/types/public-copy';

// The species page, with the plant info saved on the phone swapped for made-up plants. Opening it
// from the Plants tab is tested in plants-screen.test.tsx, and from a plant page in
// plant-screen.test.tsx.

jest.mock('@/state/records-context', () => ({ useRecords: jest.fn() }));

const NONE_TAGGED =
  'No tagged plants of this species are public yet. New records only show up here after a ' +
  'conservation officer approves them.';
const PROTECTED_NOTE =
  "It's also listed as a protected plant in Sarawak, under the Wild Life Protection " +
  'Ordinance 1998.';
const DOWNLOADED = '2026-11-04T06:15:00.000Z';

// Made-up plant info. Like the real copy, the plants have no location.
const PITCHER: PublicSpecies = {
  slug: 'nepenthes-rafflesiana',
  scientificName: 'Nepenthes rafflesiana',
  authority: 'Jack',
  family: 'Nepenthaceae',
  commonNames: ['Raffles pitcher plant', 'Periuk kera', 'Monkey cup'],
  iucnCode: 'LC',
  sarawakProtected: true,
  newerName: 'Pitcheria rafflesiana',
  summary: 'A pitcher plant that traps insects.',
  about: 'Its pitchers hold a liquid that breaks down whatever falls in.',
  habitat: 'Forest edges and open heath forest.',
  uses: '',
};

const BELIAN: PublicSpecies = {
  slug: 'eusideroxylon-zwageri',
  scientificName: 'Eusideroxylon zwageri',
  authority: 'Teijsm. & Binn.',
  family: 'Lauraceae',
  commonNames: ['Belian'],
  iucnCode: 'VU',
  sarawakProtected: false,
  summary: 'A very hard timber tree.',
  about: '',
  habitat: '',
  uses: 'Its wood is used for posts and roofs.',
};

// A species added on the website with only its name and status filled in so far.
const BENJAMINA: PublicSpecies = {
  slug: 'ficus-benjamina',
  scientificName: 'Ficus benjamina',
  authority: '',
  family: '',
  commonNames: [],
  iucnCode: 'NE',
  sarawakProtected: false,
  summary: '',
  about: '',
  habitat: '',
  uses: '',
};

const PITCHER_PLANT: PublicRecord = {
  id: 'e1a2b3c4-5d6e-4f70-8a9b-0c1d2e3f4a51',
  tagCode: 'NNP-E1A2B3',
  speciesSlug: 'nepenthes-rafflesiana',
  speciesName: 'Nepenthes rafflesiana',
  commonName: 'Raffles pitcher plant',
  heightM: 1.5,
  condition: 'healthy',
  recordedAt: '2026-10-20T02:30:00.000Z',
};

// The server can cut the time to the start of the day in park time, which is still the day
// before in UTC.
const CUT_PITCHER_PLANT: PublicRecord = {
  id: 'd2c3b4a5-6f7e-4d8c-9b0a-2e3f4a5b6c73',
  tagCode: 'NNP-D2C3B4',
  speciesSlug: 'nepenthes-rafflesiana',
  speciesName: 'Nepenthes rafflesiana',
  heightM: 0.8,
  condition: 'damaged',
  recordedAt: '2026-10-21T16:00:00.000Z',
};

// The newest pitcher plant, with no height or condition.
const NEW_PITCHER_PLANT: PublicRecord = {
  id: 'a3b4c5d6-7e8f-4a9b-8c0d-1e2f3a4b5c62',
  tagCode: 'NNP-A3B4C5',
  speciesSlug: 'nepenthes-rafflesiana',
  speciesName: 'Nepenthes rafflesiana',
  recordedAt: '2026-10-23T03:00:00.000Z',
};

const BELIAN_PLANT: PublicRecord = {
  id: 'b5c6d7e8-9f0a-4b1c-8d2e-3f4a5b6c7d84',
  tagCode: 'NNP-B5C6D7',
  speciesSlug: 'eusideroxylon-zwageri',
  speciesName: 'Eusideroxylon zwageri',
  commonName: 'Belian',
  heightM: 22,
  condition: 'healthy',
  recordedAt: '2026-10-22T01:00:00.000Z',
};

// A fig the field team hasn't matched to a species yet.
const FIG_PLANT: PublicRecord = {
  id: '9b8c7d6e-1f2a-4b3c-8d4e-5f6a7b8c9d02',
  tagCode: 'NNP-9B8C7D',
  speciesName: 'Ficus sp.',
  recordedAt: '2026-10-24T02:00:00.000Z',
};

// Out of order, so the page has to sort them.
const PLANTS = [PITCHER_PLANT, BELIAN_PLANT, CUT_PITCHER_PLANT, FIG_PLANT, NEW_PITCHER_PLANT];

const NEW_ROW = 'Tag NNP-A3B4C5, Height not measured, recorded 23 Oct 2026';
const CUT_ROW = 'Tag NNP-D2C3B4, 0.8 m tall, recorded 22 Oct 2026, Damaged';
const OLD_ROW = 'Tag NNP-E1A2B3, 1.5 m tall, recorded 20 Oct 2026, Healthy';
const BELIAN_ROW = 'Tag NNP-B5C6D7, 22 m tall, recorded 22 Oct 2026, Healthy';

// Each species' main photo, saved on the phone under a made-up file name.
const PITCHER_PHOTO: PublicPhoto = {
  speciesSlug: 'nepenthes-rafflesiana',
  url:
    'https://storage.example/botanical-photos/species/nepenthes-rafflesiana/' +
    '5d0c8e2a-7b1f-4c3d-9e6a-2f4b8c1d3e5a.jpg',
  caption: 'A pitcher on its vine.',
  credit: 'Niah field team',
  file: '7f3a9c2e-4b1d-4e6f-8a2c-5d9e1b7f3a04',
};

const BELIAN_PHOTO: PublicPhoto = {
  speciesSlug: 'eusideroxylon-zwageri',
  url: 'https://images.example/belian-trunk.jpg',
  caption: 'A belian trunk.',
  credit: 'Niah field team',
  file: '2b6e9d1f-3a8c-4f5e-b7d2-1c4a6e8f0b39',
};

type PlantInfo = {
  species?: PublicSpecies[];
  photos?: PublicPhoto[];
  copyAt?: string | null;
};

/** The plant info on the phone, the species photos it has, and when it came down. */
function setPlantInfo({
  species = [PITCHER, BELIAN, BENJAMINA],
  photos = [BELIAN_PHOTO, PITCHER_PHOTO],
  copyAt = DOWNLOADED,
}: PlantInfo = {}) {
  jest.mocked(useRecords).mockReturnValue({
    publicSpecies: species,
    publicRecords: PLANTS,
    publicPhotos: photos,
    publicCopyAt: copyAt,
  } as never);
}

function PlantStandIn() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  return <Text>Plant page for {tag}</Text>;
}

function TestLayout() {
  return <Stack />;
}

function openSpecies(slug: string) {
  return renderRouter(
    {
      _layout: TestLayout,
      'species/[slug]': SpeciesScreen,
      'plant/[tag]': PlantStandIn,
    },
    { initialUrl: `/species/${slug}` },
  );
}

/** What a screen reader reads out for each tagged plant, from the top of the list down. */
function rowLabels() {
  return screen
    .queryAllByLabelText(/^Tag NNP-/)
    .map((row) => row.props.accessibilityLabel ?? row.props['aria-label']);
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlantInfo();
});

describe('species page', () => {
  it("shows the species' names, family and status", async () => {
    openSpecies('nepenthes-rafflesiana');
    const name = await screen.findByRole('heading', { name: 'Raffles pitcher plant' });
    expect(name).not.toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText('Nepenthaceae')).toBeVisible();
    // The Latin name is in italics, and the authority after it isn't.
    const latin = screen.getByText('Nepenthes rafflesiana Jack');
    expect(latin).not.toHaveStyle({ fontStyle: 'italic' });
    expect(within(latin).getByText('Nepenthes rafflesiana')).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText('Also called Periuk kera, Monkey cup')).toBeVisible();
    expect(
      screen.getByText('Newer sources put it in a different genus, as Pitcheria rafflesiana.'),
    ).toBeVisible();
    expect(screen.getByText('Pitcheria rafflesiana')).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByLabelText('IUCN status: Least Concern')).toBeVisible();
    expect(screen.getByText('Protected in Sarawak')).toBeVisible();
    expect(screen.getByText('A pitcher plant that traps insects.')).toBeVisible();
  });

  it("shows the species' sections from the website, leaving out empty ones", async () => {
    openSpecies('nepenthes-rafflesiana');
    expect(await screen.findByRole('heading', { name: 'About' })).toBeVisible();
    expect(
      screen.getByText('Its pitchers hold a liquid that breaks down whatever falls in.'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Where it grows' })).toBeVisible();
    expect(screen.getByText('Forest edges and open heath forest.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'How people use it' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Conservation status' })).toBeVisible();
    expect(
      screen.getByText(
        'Least Concern (LC) on the IUCN Red List. It is widespread and not at risk right now.',
      ),
    ).toBeVisible();
    expect(screen.getByText(PROTECTED_NOTE)).toBeVisible();
  });

  it('lists the tagged plants of this species, newest first', async () => {
    openSpecies('nepenthes-rafflesiana');
    expect(await screen.findByRole('heading', { name: 'Tagged in the park' })).toBeVisible();
    // The belian and the fig aren't this species, so they aren't in the list.
    expect(rowLabels()).toEqual([NEW_ROW, CUT_ROW, OLD_ROW]);
    const oldRow = within(screen.getByLabelText(OLD_ROW));
    expect(oldRow.getByText('NNP-E1A2B3')).toBeVisible();
    expect(oldRow.getByText('1.5 m tall · recorded 20 Oct 2026 · Healthy')).toBeVisible();
    const newRow = within(screen.getByLabelText(NEW_ROW));
    expect(newRow.getByText('Height not measured · recorded 23 Oct 2026')).toBeVisible();
    expect(screen.queryByText(NONE_TAGGED)).toBeNull();
  });

  it('opens the plant page from a tagged plant', async () => {
    const app = openSpecies('nepenthes-rafflesiana');
    fireEvent.press(await screen.findByLabelText(CUT_ROW));
    expect(app.getPathname()).toBe('/plant/NNP-D2C3B4');
    expect(await screen.findByText('Plant page for NNP-D2C3B4')).toBeVisible();
  });

  it('lists a tagged plant when it is the only one of its species', async () => {
    openSpecies('eusideroxylon-zwageri');
    expect(await screen.findByRole('heading', { name: 'Belian' })).toBeVisible();
    expect(rowLabels()).toEqual([BELIAN_ROW]);
    expect(screen.queryByText(NONE_TAGGED)).toBeNull();
  });

  it('shows a threatened species that is not protected in Sarawak', async () => {
    openSpecies('eusideroxylon-zwageri');
    expect(await screen.findByLabelText('IUCN status: Vulnerable')).toBeVisible();
    expect(screen.queryByText('Protected in Sarawak')).toBeNull();
    expect(
      screen.getByText(
        'Vulnerable (VU) on the IUCN Red List. It faces a high risk of dying out in the wild.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(PROTECTED_NOTE)).toBeNull();
    // The website only says how people use the belian so far.
    expect(screen.getByRole('heading', { name: 'How people use it' })).toBeVisible();
    expect(screen.getByText('Its wood is used for posts and roofs.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'About' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Where it grows' })).toBeNull();
  });
});

describe('species photo', () => {
  it('shows the saved photo with its caption and credit', async () => {
    openSpecies('nepenthes-rafflesiana');
    const photo = await screen.findByLabelText('A pitcher on its vine.');
    // Screen readers stop on the photo and read out its caption.
    expect(photo).toHaveProp('accessible', true);
    // The photo comes from the file on the phone, never the link, so it shows with no signal.
    expect(photo).toHaveProp('source', [
      expect.objectContaining({
        uri: 'file:///document/species-photos/7f3a9c2e-4b1d-4e6f-8a2c-5d9e1b7f3a04',
      }),
    ]);
    expect(screen.getByText('A pitcher on its vine. Photo: Niah field team')).toBeVisible();
    // A copy in the image cache on disk would stay behind after the photo changes.
    expect(screen.UNSAFE_getByType(Image).props.cachePolicy).toBe('memory');
    // The belian's photo comes first in the plant info, but it's for another species.
    expect(screen.queryByLabelText('A belian trunk.')).toBeNull();
  });

  it('describes a photo with no caption by the name of the plant', async () => {
    setPlantInfo({ photos: [{ ...PITCHER_PHOTO, caption: '  ' }] });
    openSpecies('nepenthes-rafflesiana');
    expect(await screen.findByLabelText('A photo of Raffles pitcher plant')).toBeVisible();
    expect(screen.getByText('Photo: Niah field team')).toBeVisible();
  });

  it('leaves out the line under the photo when there is no caption or credit', async () => {
    setPlantInfo({ photos: [{ ...PITCHER_PHOTO, caption: '', credit: ' ' }] });
    openSpecies('nepenthes-rafflesiana');
    expect(await screen.findByLabelText('A photo of Raffles pitcher plant')).toBeVisible();
    expect(screen.queryByText(/^Photo:/)).toBeNull();
  });

  it("leaves the photo out until it's saved on the phone", async () => {
    setPlantInfo({ photos: [{ ...PITCHER_PHOTO, file: undefined }] });
    openSpecies('nepenthes-rafflesiana');
    expect(await screen.findByRole('heading', { name: 'Raffles pitcher plant' })).toBeVisible();
    expect(screen.UNSAFE_queryByType(Image)).toBeNull();
    expect(screen.queryByText(/Photo: Niah field team/)).toBeNull();
  });
});

describe('species with only its name and status', () => {
  it('uses the Latin name in italics and leaves out what it has no info for', async () => {
    openSpecies('ficus-benjamina');
    const name = await screen.findByRole('heading', { name: 'Ficus benjamina' });
    expect(name).toHaveStyle({ fontStyle: 'italic' });
    // The name is the Latin name already, so it isn't shown a second time under it.
    expect(screen.getAllByText('Ficus benjamina')).toHaveLength(1);
    expect(screen.queryByText(/^Also called/)).toBeNull();
    expect(screen.queryByText(/^Newer sources/)).toBeNull();
    expect(screen.getByLabelText('IUCN status: Not Evaluated')).toBeVisible();
    expect(screen.queryByText('Protected in Sarawak')).toBeNull();
    expect(screen.UNSAFE_queryByType(Image)).toBeNull();
  });

  it('only shows the conservation status card', async () => {
    openSpecies('ficus-benjamina');
    expect(await screen.findByRole('heading', { name: 'Conservation status' })).toBeVisible();
    expect(
      screen.getByText(
        "Not Evaluated (NE) on the IUCN Red List. It hasn't been checked against the Red List " +
          "criteria yet, so it isn't on the scale.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(PROTECTED_NOTE)).toBeNull();
    for (const section of ['About', 'Where it grows', 'How people use it']) {
      expect(screen.queryByRole('heading', { name: section })).toBeNull();
    }
  });

  it('says no tagged plants of it are public yet', async () => {
    openSpecies('ficus-benjamina');
    // The fig the field team hasn't matched to a species yet doesn't count as this one.
    expect(await screen.findByText(NONE_TAGGED)).toBeVisible();
    expect(rowLabels()).toEqual([]);
  });

  it('shows the authority on its own under the Latin name', async () => {
    setPlantInfo({ species: [{ ...BENJAMINA, authority: 'L.' }] });
    openSpecies('ficus-benjamina');
    expect(await screen.findByText('L.')).toBeVisible();
    expect(screen.getAllByText('Ficus benjamina')).toHaveLength(1);
  });
});

describe('species page for a species not in the plant info', () => {
  it('says the info will show once the phone updates', async () => {
    openSpecies('shorea-macrophylla');
    expect(
      await screen.findByRole('heading', { name: 'No plant info for this species yet' }),
    ).toBeVisible();
    expect(
      screen.getByText("It'll show once this phone is online and the plant info updates."),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Tagged in the park' })).toBeNull();
    expect(screen.queryByText(/^Info from/)).toBeNull();
  });
});

describe('when the plant info came down', () => {
  it.each([
    ['today', 0],
    ['yesterday', 1],
  ])('says "Info from %s" in lower case', async (word, daysAgo) => {
    const copyAt = new Date();
    copyAt.setDate(copyAt.getDate() - daysAgo);
    setPlantInfo({ copyAt: copyAt.toISOString() });
    openSpecies('nepenthes-rafflesiana');
    const time = formatTime(copyAt.toISOString());
    expect(await screen.findByText(`Info from ${word}, ${time}`)).toBeVisible();
  });

  it('gives the date for plant info from before yesterday', async () => {
    const copyAt = '2026-10-02T06:15:00.000Z';
    setPlantInfo({ copyAt });
    openSpecies('nepenthes-rafflesiana');
    expect(await screen.findByText(`Info from ${formatRecordedAt(copyAt)}`)).toBeVisible();
  });

  it("leaves the line out when the plant info hasn't come down", async () => {
    setPlantInfo({ copyAt: null });
    openSpecies('nepenthes-rafflesiana');
    expect(await screen.findByRole('heading', { name: 'Raffles pitcher plant' })).toBeVisible();
    expect(screen.queryByText(/^Info from/)).toBeNull();
  });
});

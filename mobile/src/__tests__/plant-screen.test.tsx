import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import PlantScreen from '@/app/plant/[tag]';
import { formatRecordedAt, formatTime } from '@/lib/format';
import { matchesTag } from '@/lib/id';
import { useRecords } from '@/state/records-context';
import type { PublicPhoto, PublicRecord, PublicSpecies } from '@/types/public-copy';

// The plant page, with the plant info saved on the phone swapped for made-up plants. Opening it
// from a scan or from History is tested in scan-plant-info.test.tsx.

jest.mock('@/state/records-context', () => ({ useRecords: jest.fn() }));

const NO_SPECIES = "The field team hasn't matched this plant to a species on our list yet.";
const NOT_YET =
  "It'll show once this phone is online and the plant info updates. New records only show up " +
  'after a conservation officer approves them.';
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
  commonNames: ['Raffles pitcher plant', 'Periuk kera'],
  iucnCode: 'LC',
  sarawakProtected: true,
  newerName: 'Pitcheria rafflesiana',
  summary: 'A pitcher plant that traps insects.',
  about: 'Its pitchers hold a liquid that breaks down whatever falls in.',
  habitat: 'Forest edges and open heath forest.',
  uses: '',
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

const BENJAMINA_PLANT: PublicRecord = {
  id: 'f4e5d6c7-2a3b-4c5d-8e6f-7a8b9c0d1e03',
  tagCode: 'NNP-F4E5D6',
  speciesSlug: 'ficus-benjamina',
  speciesName: 'Ficus benjamina',
  heightM: 4,
  condition: 'damaged',
  recordedAt: '2026-10-21T01:00:00.000Z',
};

// Not matched to a species yet, with no height or condition. The server can cut the time to the
// start of the day in park time, which is still the day before in UTC.
const FIG_PLANT: PublicRecord = {
  id: '9b8c7d6e-1f2a-4b3c-8d4e-5f6a7b8c9d02',
  tagCode: 'NNP-9B8C7D',
  speciesName: 'Ficus sp.',
  recordedAt: '2026-10-19T16:00:00.000Z',
};

// Not matched to a species either, but the field team gave it a common name.
const STRANGLER_PLANT: PublicRecord = {
  id: 'c7d8e9f0-3b4c-4d5e-9f6a-8b9c0d1e2f04',
  tagCode: 'NNP-C7D8E9',
  speciesName: 'Ficus sp.',
  commonName: 'Strangler fig',
  recordedAt: '2026-10-22T03:00:00.000Z',
};

const PLANTS = [PITCHER_PLANT, BENJAMINA_PLANT, FIG_PLANT, STRANGLER_PLANT];

// The pitcher plant species' main photo, saved on the phone under a made-up file name.
const PITCHER_PHOTO: PublicPhoto = {
  speciesSlug: 'nepenthes-rafflesiana',
  url:
    'https://storage.example/botanical-photos/species/nepenthes-rafflesiana/' +
    '5d0c8e2a-7b1f-4c3d-9e6a-2f4b8c1d3e5a.jpg',
  caption: 'A pitcher on its vine.',
  credit: 'Niah field team',
  file: '7f3a9c2e-4b1d-4e6f-8a2c-5d9e1b7f3a04',
};

/** The plant info on the phone, when it came down, and the species photos it has. */
function setPlantInfo(publicCopyAt = DOWNLOADED, publicPhotos: PublicPhoto[] = []) {
  jest.mocked(useRecords).mockReturnValue({
    findPublicByTag: (input: string) => PLANTS.find((plant) => matchesTag(plant, input)),
    publicSpecies: [PITCHER, BENJAMINA],
    publicCopyAt,
    publicPhotos,
  } as never);
}

function StandIn({ name }: { name: string }) {
  return <Text>{name}</Text>;
}

function TestLayout() {
  return <Stack />;
}

function renderApp(initialUrl: string) {
  return renderRouter(
    {
      _layout: TestLayout,
      scan: () => <StandIn name="Scan page" />,
      'plant/[tag]': PlantScreen,
      'species/[slug]': () => <StandIn name="Species page" />,
    },
    { initialUrl },
  );
}

function openPlant(tag: string) {
  return renderApp(`/plant/${tag}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlantInfo();
});

describe('plant page', () => {
  it("shows the plant's names, family and status from its species", async () => {
    openPlant('NNP-E1A2B3');
    const name = await screen.findByRole('heading', { name: 'Raffles pitcher plant' });
    expect(name).not.toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText('Tag NNP-E1A2B3')).toBeVisible();
    expect(screen.getByText('Nepenthes rafflesiana')).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText('Also called Periuk kera')).toBeVisible();
    expect(screen.getByText('Nepenthaceae family')).toBeVisible();
    expect(
      screen.getByText('Newer sources put it in a different genus, as Pitcheria rafflesiana.'),
    ).toBeVisible();
    expect(screen.getByText('Pitcheria rafflesiana')).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByLabelText('IUCN status: Least Concern')).toBeVisible();
    expect(screen.getByText('Protected in Sarawak')).toBeVisible();
    expect(screen.getByText('A pitcher plant that traps insects.')).toBeVisible();
  });

  it("shows the record's height, condition and the day it was recorded", async () => {
    openPlant('NNP-E1A2B3');
    expect(await screen.findByRole('heading', { name: 'This plant' })).toBeVisible();
    expect(screen.getByText('1.5 m')).toBeVisible();
    expect(screen.getByText('Healthy')).toBeVisible();
    expect(screen.getByText('20 Oct 2026')).toBeVisible();
  });

  it("shows the species' sections from the website, leaving out empty ones", async () => {
    openPlant('NNP-E1A2B3');
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

  it('shows the printed tag code even when the link has it in lower case', async () => {
    openPlant('nnp-e1a2b3');
    expect(await screen.findByRole('heading', { name: 'Raffles pitcher plant' })).toBeVisible();
    expect(screen.getByText('Tag NNP-E1A2B3')).toBeVisible();
  });

  it('uses the Latin name in italics when the species has no common name', async () => {
    openPlant('NNP-F4E5D6');
    const name = await screen.findByRole('heading', { name: 'Ficus benjamina' });
    expect(name).toHaveStyle({ fontStyle: 'italic' });
    // The name is the Latin name already, so it isn't shown a second time under it.
    expect(screen.getAllByText('Ficus benjamina')).toHaveLength(1);
    expect(screen.queryByText(/^Also called/)).toBeNull();
    // Matching trims the text, so a family line with no family in it would read "family".
    expect(screen.queryByText(/family$/)).toBeNull();
    expect(screen.getByLabelText('IUCN status: Not Evaluated')).toBeVisible();
    expect(screen.queryByText('Protected in Sarawak')).toBeNull();
    expect(screen.getByText('4 m')).toBeVisible();
    expect(screen.getByText('Damaged')).toBeVisible();
  });

  it('only shows the conservation status for a species with nothing else written', async () => {
    openPlant('NNP-F4E5D6');
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
    expect(screen.queryByText(NO_SPECIES)).toBeNull();
  });

  it("says the plant isn't matched to a species yet, and shows what the record has", async () => {
    openPlant('NNP-9B8C7D');
    const name = await screen.findByRole('heading', { name: 'Ficus sp.' });
    expect(name).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getAllByText('Ficus sp.')).toHaveLength(1);
    expect(screen.getByText(NO_SPECIES)).toBeVisible();
    expect(screen.getByText('Not measured')).toBeVisible();
    expect(screen.getByText('Not recorded')).toBeVisible();
    expect(screen.getByText('20 Oct 2026')).toBeVisible();
    expect(screen.queryByLabelText(/^IUCN status/)).toBeNull();
    expect(screen.queryByText('Protected in Sarawak')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Conservation status' })).toBeNull();
  });

  it("uses the field team's common name for a plant with no species yet", async () => {
    openPlant('NNP-C7D8E9');
    const name = await screen.findByRole('heading', { name: 'Strangler fig' });
    expect(name).not.toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText('Ficus sp.')).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText(NO_SPECIES)).toBeVisible();
  });
});

describe('species photo and page', () => {
  it('shows the saved species photo with its caption and credit', async () => {
    setPlantInfo(DOWNLOADED, [PITCHER_PHOTO]);
    openPlant('NNP-E1A2B3');
    expect(await screen.findByRole('heading', { name: 'Photo' })).toBeVisible();
    expect(screen.getByText('This photo shows the species, not this plant.')).toBeVisible();
    // The photo comes from the file on the phone, never the link, so it shows with no signal.
    expect(screen.getByLabelText('A pitcher on its vine.')).toHaveProp('source', [
      expect.objectContaining({
        uri: 'file:///document/species-photos/7f3a9c2e-4b1d-4e6f-8a2c-5d9e1b7f3a04',
      }),
    ]);
    expect(screen.getByText('A pitcher on its vine. Photo: Niah field team')).toBeVisible();
  });

  it("leaves the photo out until it's saved on the phone", async () => {
    setPlantInfo(DOWNLOADED, [{ ...PITCHER_PHOTO, file: undefined }]);
    openPlant('NNP-E1A2B3');
    expect(await screen.findByRole('heading', { name: 'This plant' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Photo' })).toBeNull();
    expect(screen.queryByLabelText('A pitcher on its vine.')).toBeNull();
  });

  it("doesn't show another species' photo", async () => {
    setPlantInfo(DOWNLOADED, [PITCHER_PHOTO]);
    openPlant('NNP-F4E5D6');
    expect(await screen.findByRole('heading', { name: 'This plant' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Photo' })).toBeNull();
  });

  it('opens the species page from More about this species', async () => {
    const app = openPlant('NNP-E1A2B3');
    fireEvent.press(await screen.findByRole('button', { name: 'More about this species' }));
    expect(app.getPathname()).toBe('/species/nepenthes-rafflesiana');
    expect(await screen.findByText('Species page')).toBeVisible();
  });

  it('has no species page button for a plant with no species yet', async () => {
    openPlant('NNP-9B8C7D');
    expect(await screen.findByRole('heading', { name: 'Ficus sp.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'More about this species' })).toBeNull();
  });
});

describe('when the plant info came down', () => {
  it.each([
    ['today', 0],
    ['yesterday', 1],
  ])('says "Info from %s" in lower case', async (word, daysAgo) => {
    const copyAt = new Date();
    copyAt.setDate(copyAt.getDate() - daysAgo);
    setPlantInfo(copyAt.toISOString());
    openPlant('NNP-E1A2B3');
    const time = formatTime(copyAt.toISOString());
    expect(await screen.findByText(`Info from ${word}, ${time}`)).toBeVisible();
  });

  it('gives the date for plant info from before yesterday', async () => {
    const copyAt = '2026-10-02T06:15:00.000Z';
    setPlantInfo(copyAt);
    openPlant('NNP-E1A2B3');
    expect(await screen.findByText(`Info from ${formatRecordedAt(copyAt)}`)).toBeVisible();
  });
});

describe('plant page for a tag with no plant info', () => {
  it('says the info will show once the phone updates', async () => {
    openPlant('NNP-A1B2C3');
    expect(
      await screen.findByRole('heading', { name: 'No plant info for this tag yet' }),
    ).toBeVisible();
    expect(screen.getByText(NOT_YET)).toBeVisible();
    expect(screen.queryByText(/^Info from/)).toBeNull();
  });

  it('goes back to the Scan tab without stacking a second copy of it', async () => {
    const app = renderApp('/scan');
    testRouter.push('/plant/NNP-A1B2C3');
    fireEvent.press(await screen.findByRole('button', { name: 'Scan a plant tag' }));
    expect(app.getPathname()).toBe('/scan');
    expect(screen.queryByRole('heading', { name: 'No plant info for this tag yet' })).toBeNull();
    expect(screen.getByText('Scan page')).toBeVisible();
    expect(testRouter.canGoBack()).toBe(false);
  });
});

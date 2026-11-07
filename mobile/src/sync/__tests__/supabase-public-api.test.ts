import type { SupabaseClient } from '@supabase/supabase-js';
import * as Network from 'expo-network';

import { supabasePublicCopyApi } from '@/sync/supabase-public-api';

jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn() }));

// A fake Supabase client that writes down everything the phone asks for. Its answers have the same
// shape as what supabase-js gives back. The rows only have IDs, since these tests are about what
// gets asked and not about the plant info itself, and the links to stored photos are made up.

type Answer = {
  data: { id: string }[] | null;
  error: { message: string; code: string } | null;
  status: number;
};

type Question = {
  table: string;
  fields?: string[];
  filters: [string, unknown][];
  orderBy: string[];
  range?: [number, number];
};

const SPECIES_FIELDS = [
  'id',
  'scientific_name',
  'authority',
  'family',
  'common_names',
  'iucn_code',
  'sarawak_protected',
  'newer_name',
  'summary',
  'about',
  'description',
  'habitat',
  'uses',
];
const RECORD_FIELDS = [
  'id',
  'tag_code',
  'species_slug',
  'species_name',
  'common_name',
  'height_m',
  'condition',
  'recorded_at',
];

const NO_SIGNAL: Answer = {
  data: null,
  error: { message: 'TypeError: Network request failed', code: '' },
  status: 0,
};
const MISSING_COLUMN: Answer = {
  data: null,
  error: { message: 'column species_public.newer_name does not exist', code: '42703' },
  status: 400,
};

function rows(...ids: string[]): Answer {
  return { data: ids.map((id) => ({ id })), error: null, status: 200 };
}

/** Sends these rows on the first page, then an empty page, which is how the list ends. */
function onePage(...ids: string[]) {
  return (_table: string, from: number) => (from === 0 ? rows(...ids) : rows());
}

function fakeServer(answer: (table: string, from: number) => Answer) {
  const asked: Question[] = [];
  const supabase = {
    from(table: string) {
      const question: Question = { table, filters: [], orderBy: [] };
      asked.push(question);
      const query = {
        select(columns: string) {
          question.fields = columns.split(',').map((field) => field.trim());
          return query;
        },
        eq(column: string, value: unknown) {
          question.filters.push([column, value]);
          return query;
        },
        order(column: string) {
          question.orderBy.push(column);
          return query;
        },
        range(from: number, to: number) {
          question.range = [from, to];
          return Promise.resolve(answer(table, from));
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://storage.example/${bucket}/${path}` } };
          },
        };
      },
    },
  };
  return { api: supabasePublicCopyApi(supabase as unknown as SupabaseClient), asked };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchSpecies', () => {
  it('asks for only the fields the plant page shows, a page at a time, sorted by ID', async () => {
    const { api, asked } = fakeServer(onePage('ficus-benjamina', 'nepenthes-rafflesiana'));
    expect(await api.fetchSpecies()).toEqual([
      { id: 'ficus-benjamina' },
      { id: 'nepenthes-rafflesiana' },
    ]);
    expect(asked).toEqual([
      {
        table: 'species_public',
        fields: SPECIES_FIELDS,
        filters: [],
        orderBy: ['id'],
        range: [0, 499],
      },
      {
        table: 'species_public',
        fields: SPECIES_FIELDS,
        filters: [],
        orderBy: ['id'],
        range: [2, 501],
      },
    ]);
  });
});

describe('fetchRecords', () => {
  it('asks for only the published records and the fields the plant page shows', async () => {
    const { api, asked } = fakeServer(onePage('3f9a1c2e-5b7d-4e6f-8a9b-0c1d2e3f4a50'));
    expect(await api.fetchRecords()).toEqual([{ id: '3f9a1c2e-5b7d-4e6f-8a9b-0c1d2e3f4a50' }]);
    expect(asked).toEqual([
      {
        table: 'records_public',
        fields: RECORD_FIELDS,
        filters: [['status', 'published']],
        orderBy: ['id'],
        range: [0, 499],
      },
      {
        table: 'records_public',
        fields: RECORD_FIELDS,
        filters: [['status', 'published']],
        orderBy: ['id'],
        range: [1, 500],
      },
    ]);
  });

  // records_public has a location column. The plant page doesn't say where a plant is, so the
  // phone never asks for it and it can't end up saved on a visitor's phone.
  it('never asks for the location column', async () => {
    const { api, asked } = fakeServer(onePage('3f9a1c2e-5b7d-4e6f-8a9b-0c1d2e3f4a50'));
    await api.fetchRecords();
    expect(asked.length).toBeGreaterThan(0);
    for (const question of asked) {
      expect(question.fields).not.toContain('gps');
      expect(question.fields).not.toContain('*');
    }
  });
});

describe('fetchPhotos', () => {
  it('asks for the photo list of every species, a page at a time, sorted by ID', async () => {
    const { api, asked } = fakeServer(onePage('nepenthes-rafflesiana'));
    expect(await api.fetchPhotos()).toEqual([{ id: 'nepenthes-rafflesiana' }]);
    expect(asked).toEqual([
      {
        table: 'species_photos_public',
        fields: ['id', 'photos'],
        filters: [],
        orderBy: ['id'],
        range: [0, 499],
      },
      {
        table: 'species_photos_public',
        fields: ['id', 'photos'],
        filters: [],
        orderBy: ['id'],
        range: [1, 500],
      },
    ]);
  });
});

describe('photoUrl', () => {
  // The photos taken of each record are kept somewhere else that needs a sign in, so the phone
  // only builds links into the website's public storage for species photos.
  it('builds the link to a photo in the public storage for species photos', () => {
    const { api, asked } = fakeServer(onePage());
    const path = 'species/nepenthes-rafflesiana/5d0c8e2a-7b1f-4c3d-9e6a-2f4b8c1d3e5a.jpg';
    expect(api.photoUrl(path)).toBe(`https://storage.example/botanical-photos/${path}`);
    expect(asked).toEqual([]);
  });
});

describe.each([
  ['fetchSpecies', "Couldn't download the plant info."],
  ['fetchRecords', "Couldn't download the plant info."],
  ['fetchPhotos', "Couldn't download the species photos."],
] as const)('%s', (fetch, warning) => {
  it('gives null and warns when the server answers with an error', async () => {
    const { api } = fakeServer(() => MISSING_COLUMN);
    expect(await api[fetch]()).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(warning, MISSING_COLUMN.error);
  });

  // No answer at all just means no signal, and that fixes itself.
  it('gives null without a warning when there is no answer at all', async () => {
    const { api } = fakeServer(() => NO_SIGNAL);
    expect(await api[fetch]()).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('gives null, and not half the list, when a later page fails', async () => {
    const { api, asked } = fakeServer((_table, from) => (from === 0 ? rows('a', 'b') : NO_SIGNAL));
    expect(await api[fetch]()).toBeNull();
    expect(asked.map((question) => question.range)).toEqual([
      [0, 499],
      [2, 501],
    ]);
  });
});

describe('online', () => {
  it('only counts the phone as offline when it knows it has no signal', async () => {
    const { api, asked } = fakeServer(onePage());
    const networkState = jest.mocked(Network.getNetworkStateAsync);

    networkState.mockResolvedValueOnce({ isConnected: false });
    expect(await api.online()).toBe(false);

    networkState.mockResolvedValueOnce({ isConnected: true });
    expect(await api.online()).toBe(true);

    // The phone isn't sure, so it tries.
    networkState.mockResolvedValueOnce({});
    expect(await api.online()).toBe(true);

    expect(asked).toEqual([]);
  });
});

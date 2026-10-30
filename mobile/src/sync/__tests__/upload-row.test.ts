import { tagCodeFor } from '@/lib/id';
import {
  classifyUpload,
  toUploadRow,
  uploadProblemMessage,
  type UploadError,
  type UploadOutcome,
  type UploadRow,
} from '@/sync/upload-row';
import { UPLOAD_PROBLEMS, type PlantRecord, type UploadProblem } from '@/types/plant-record';

// The same file supabase/tests/sync.test.js uploads to a test database, so if the phone and the
// server stop agreeing on a column, one of the two test runs fails.
import phoneUpload from '../../../../supabase/tests/fixtures/phone-upload.json';

const { uploads } = phoneUpload as unknown as {
  uploads: { name: string; record: PlantRecord; row: UploadRow }[];
};

describe('toUploadRow', () => {
  it('has a few different records to check', () => {
    expect(uploads.length).toBeGreaterThanOrEqual(3);
  });

  it.each(uploads)('builds the row the server takes ($name)', ({ record, row }) => {
    expect(record.tagCode).toBe(tagCodeFor(record.id));
    expect(toUploadRow(record)).toStrictEqual(row);
  });

  it('sends null for every empty field, so nothing falls back to a server default', () => {
    const typedName = uploads.find(({ row }) => row.gps === null);
    expect(typedName).toBeDefined();
    expect(toUploadRow(typedName!.record)).toMatchObject({
      species_slug: null,
      common_name: null,
      height_m: null,
      notes: null,
      gps: null,
    });
  });

  it('never sends the tag code or the columns only the server fills in', () => {
    const row = toUploadRow(uploads[0].record);
    for (const column of ['tag_code', 'status', 'recorded_by', 'submitted_by', 'sync_status']) {
      expect(row).not.toHaveProperty(column);
    }
  });
});

describe('classifyUpload', () => {
  const synced: UploadOutcome = { kind: 'synced' };
  const retry: UploadOutcome = { kind: 'retry' };
  const problem = (kind: UploadProblem): UploadOutcome => ({
    kind: 'problem',
    problem: kind,
  });

  // The messages are the ones Postgres sends, through the Supabase API.
  it.each<{ about: string; error: UploadError | null; outcome: UploadOutcome }>([
    { about: 'no error', error: null, outcome: synced },
    {
      about: 'the record went up on an earlier try',
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "records_pkey"',
      },
      outcome: synced,
    },
    {
      about: 'another record has the same tag code',
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "records_tag_code_key"',
      },
      outcome: problem('tag-clash'),
    },
    {
      // The message supabase/010_deleted_records.sql makes up for an ID it keeps
      about: 'an officer deleted the record on the website',
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "deleted_records_pkey"',
      },
      outcome: problem('deleted'),
    },
    {
      about: 'some other unique rule',
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "records_pkey_old"',
      },
      outcome: problem('rejected'),
    },
    {
      about: 'the account has no field staff role',
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "records"',
      },
      outcome: problem('not-allowed'),
    },
    {
      about: 'nobody is signed in',
      error: {
        code: '42501',
        message: 'permission denied for table records',
      },
      outcome: problem('not-allowed'),
    },
    {
      about: 'a value that breaks a check',
      error: {
        code: '23514',
        message: 'new row for relation "records" violates check constraint "records_gps_check"',
      },
      outcome: problem('rejected'),
    },
    {
      about: 'a missing species name',
      error: {
        code: '23502',
        message: 'null value in column "species_name"',
      },
      outcome: problem('rejected'),
    },
    {
      about: 'a height too big for the column',
      error: { code: '22003', message: 'numeric field overflow' },
      outcome: problem('rejected'),
    },
    {
      about: 'no signal',
      error: { code: '', message: 'TypeError: Network request failed' },
      outcome: retry,
    },
    { about: 'an error with nothing in it', error: {}, outcome: retry },
    {
      about: 'the server not having the new columns yet',
      error: {
        code: 'PGRST204',
        message: "Could not find the 'species_name' column",
      },
      outcome: retry,
    },
    {
      about: 'an expired sign in',
      error: { code: 'PGRST301', message: 'JWT expired' },
      outcome: retry,
    },
    {
      about: 'the app sending a column the server works out itself',
      error: {
        code: '428C9',
        message: 'cannot insert a non-DEFAULT value into column "tag_code"',
      },
      outcome: retry,
    },
  ])('$about', ({ error, outcome }) => {
    expect(classifyUpload(error)).toEqual(outcome);
  });
});

describe('uploadProblemMessage', () => {
  it('tells the person syncing what to do next', () => {
    expect(uploadProblemMessage('tag-clash')).toBe(
      'Another record on the server has the same tag code. Ask an officer to sort it out ' +
        "before you print this plant's tag.",
    );
    expect(uploadProblemMessage('not-allowed')).toBe(
      "Your account can't upload records yet. Ask an admin to give you the botanist role, then " +
        'sync again.',
    );
    expect(uploadProblemMessage('rejected')).toBe(
      "The server turned this record down. It's still on this phone, so ask an officer to " +
        'check it.',
    );
    expect(uploadProblemMessage('deleted')).toBe(
      "An officer deleted this record on the website, so the server won't take it again. It's " +
        'still on this phone. Ask an officer if you think it should be put back.',
    );
  });

  it('has something to say for every problem', () => {
    for (const problem of UPLOAD_PROBLEMS) {
      expect(uploadProblemMessage(problem)).toMatch(/\w/);
    }
  });
});

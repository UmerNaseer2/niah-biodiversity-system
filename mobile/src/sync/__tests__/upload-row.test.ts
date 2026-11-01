import { tagCodeFor } from '@/lib/id';
import {
  classifyPhotoUpload,
  classifyUpload,
  toUploadRow,
  uploadProblemMessage,
  type UploadError,
  type UploadOutcome,
  type UploadRow,
  isNoSignal,
  isSessionRefused,
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

describe('classifyPhotoUpload', () => {
  it('counts no error as uploaded', () => {
    expect(classifyPhotoUpload(null)).toBe('uploaded');
  });

  it('reads an error with no status as no signal', () => {
    // storage-js gives back an error with neither when fetch itself failed.
    expect(classifyPhotoUpload({})).toBe('offline');
  });

  it.each([
    ['the stand-in and the status it uses', { status: 409, statusCode: 'Duplicate' }],
    ['a body that says 409 on a 400', { status: 400, statusCode: '409' }],
    ['the code hosted Storage uses', { status: 400, code: 'ResourceAlreadyExists' }],
    ['an older name for it', { status: 400, statusCode: 'KeyAlreadyExists' }],
  ])("counts a file that's already there as uploaded: %s", (_name, error) => {
    expect(classifyPhotoUpload(error)).toBe('uploaded');
  });

  it.each([
    [{ status: 401 }],
    [{ status: 400, statusCode: '401' }],
    [{ status: 400, code: 'InvalidJWT' }],
    [{ status: 400, statusCode: 'ExpiredToken' }],
  ])('asks to sign in again for %j', (error) => {
    expect(classifyPhotoUpload(error)).toBe('signed-out');
  });

  it.each([
    [{ status: 403, statusCode: 'Unauthorized' }],
    [{ status: 400, statusCode: '403' }],
    [{ status: 400, code: 'AccessDenied' }],
  ])('says the account is not allowed for %j', (error) => {
    expect(classifyPhotoUpload(error)).toBe('not-allowed');
  });

  it.each([
    [{ status: 413, statusCode: 'Payload too large' }],
    [{ status: 400, statusCode: '413' }],
    [{ status: 400, code: 'EntityTooLarge' }],
    [{ status: 415, statusCode: 'invalid_mime_type' }],
    [{ status: 400, code: 'InvalidMimeType' }],
  ])('keeps the reason when the server turns the file down for %j', (error) => {
    expect(classifyPhotoUpload(error)).toBe('rejected');
  });

  it.each([[{ status: 500 }], [{ status: 503, statusCode: 'DatabaseTimeout' }], [{ status: 404 }]])(
    'tries again later for anything else, like %j',
    (error) => {
      expect(classifyPhotoUpload(error)).toBe('retry');
    },
  );
});

describe('isNoSignal', () => {
  it('goes by the request never getting an answer', () => {
    expect(isNoSignal({ message: 'TypeError: Network request failed', code: '' }, 0)).toBe(true);
    expect(isNoSignal({ message: 'TypeError: Network request failed' }, 0)).toBe(true);
    // Some proxies answer with a status but nothing from the database.
    expect(isNoSignal({ message: 'Bad gateway' }, 502)).toBe(true);
  });

  it("doesn't count an answer from the database, or no error at all", () => {
    expect(isNoSignal({ code: '42501', message: 'nope' }, 403)).toBe(false);
    expect(isNoSignal({ code: '23505', message: 'taken' }, 409)).toBe(false);
    expect(isNoSignal(null, 201)).toBe(false);
  });
});

describe('isSessionRefused', () => {
  it('spots the server turning the token down', () => {
    expect(isSessionRefused({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(isSessionRefused({ code: 'PGRST303', message: 'JWT expired' })).toBe(true);
  });

  it("doesn't count anything else", () => {
    expect(isSessionRefused({ code: '42501', message: 'nope' })).toBe(false);
    expect(isSessionRefused({ code: 'PGRST116', message: 'no rows' })).toBe(false);
    expect(isSessionRefused(null)).toBe(false);
  });
});

describe('uploadProblemMessage', () => {
  it('tells the person syncing what to do next', () => {
    expect(uploadProblemMessage('tag-clash')).toBe(
      'Another record on the server already has this tag code, so this one needs a new tag. If ' +
        'you already put a tag on the plant, it has to be swapped for the new one.',
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
        'still on this phone. Ask an officer if you think it should be put back, or remove it ' +
        'from this phone if not.',
    );
  });

  it('has something to say for every problem', () => {
    for (const problem of UPLOAD_PROBLEMS) {
      expect(uploadProblemMessage(problem)).toMatch(/\w/);
    }
  });
});

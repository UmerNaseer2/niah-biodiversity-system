import { Directory, File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { DatabaseLockedError, openEncryptedDatabase, unlockConnection } from '@/db/encryption';

// Real SQLCipher only runs on a phone, so the tests on a real encrypted file are written up in
// docs/test-results/item-22-encryption.md. These cover the choices this code makes, including ones
// a phone can't easily be made to hit, like the secure storage failing or a copy coming out short.

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(0xab)),
}));

jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: '/stand-in/SQLite',
  openDatabaseAsync: jest.fn(),
}));

const FOLDER = 'file:///stand-in/SQLite';
const NAME = 'test.db';
const COPY = 'encrypting-test.db';
const NEW_KEY = 'ab'.repeat(32);
const OLD_KEY = 'cd'.repeat(32);

/** A stand-in file's contents. rows stands for everything in it. */
type Contents = { key: string | null; rows: number; version: number };

function fileAt(name: string) {
  return new File(`${FOLDER}/${name}`);
}

function save(name: string, contents: Contents) {
  fileAt(name).write(new TextEncoder().encode(JSON.stringify(contents)));
}

async function load(name: string): Promise<Contents> {
  return JSON.parse(new TextDecoder().decode(await fileAt(name).arrayBuffer()));
}

/** Which build the phone is running, and what should go wrong on it. */
type Phone = {
  hasCipher: boolean;
  journalMode: string;
  rowsLostInCopy: number;
  dieDuringExport: boolean;
};

/** Treats the files the way SQLCipher does, as far as this code can tell. */
class FakeConnection {
  key: string | null = null;
  closed = false;
  private attached = '';

  constructor(
    private readonly name: string,
    private readonly phone: Phone,
  ) {
    // Like the real thing, opening a file that isn't there makes an empty one.
    if (!fileAt(name).exists) {
      save(name, { key: null, rows: 0, version: 0 });
    }
  }

  private async checkKey() {
    // A key that doesn't match can't read the file, and neither can a key on a plain file. An empty
    // file has nothing to get wrong, so any connection can read that.
    const { key, rows, version } = await load(this.name);
    const empty = !key && rows === 0 && version === 0;
    if (key !== this.key && !empty) {
      throw new Error('Error code 26: file is not a database');
    }
  }

  async getFirstAsync(sql: string) {
    if (sql === 'PRAGMA cipher_version') {
      return this.phone.hasCipher ? { cipher_version: '4.10.0' } : null;
    }
    await this.checkKey();
    if (sql === 'SELECT count(*) FROM sqlite_master') {
      return { 'count(*)': 1 };
    }
    if (sql === 'PRAGMA journal_mode = DELETE') {
      return { journal_mode: this.phone.journalMode };
    }
    if (sql === 'PRAGMA main.user_version') {
      return { user_version: (await load(this.name)).version };
    }
    if (sql.startsWith('SELECT (SELECT count(*) FROM main."records")')) {
      const [plain, copy] = [await load(this.name), await load(this.attached)];
      return { same: plain.rows === copy.rows ? 1 : 0 };
    }
    throw new Error(`The fake doesn't know ${sql}`);
  }

  async getAllAsync() {
    return [{ name: 'records' }];
  }

  async execAsync(sql: string) {
    const key = /^PRAGMA key = "x'([0-9a-f]+)'"$/.exec(sql)?.[1];
    const attach = /^ATTACH DATABASE '\/stand-in\/SQLite\/(.+)' AS encrypted KEY "x'(.+)'"$/.exec(
      sql,
    );
    const version = /^PRAGMA encrypted\.user_version = (\d+)$/.exec(sql)?.[1];
    if (key) {
      this.key = key;
    } else if (attach) {
      this.attached = attach[1];
      save(this.attached, { key: attach[2], rows: 0, version: 0 });
    } else if (sql === "SELECT sqlcipher_export('encrypted')") {
      const copy = await load(this.attached);
      const rows = (await load(this.name)).rows - this.phone.rowsLostInCopy;
      save(this.attached, { ...copy, rows });
      if (this.phone.dieDuringExport) {
        throw new Error('Cut off');
      }
    } else if (version) {
      save(this.attached, { ...(await load(this.attached)), version: Number(version) });
    } else if (sql === 'PRAGMA journal_mode = WAL') {
      await this.checkKey();
    } else if (sql !== 'DETACH DATABASE encrypted') {
      throw new Error(`The fake doesn't know ${sql}`);
    }
  }

  async closeAsync() {
    this.closed = true;
  }
}

describe('the records file encryption', () => {
  let phone: Phone;
  let connections: FakeConnection[];
  let savedKey: string | null;

  beforeEach(() => {
    phone = { hasCipher: true, journalMode: 'delete', rowsLostInCopy: 0, dieDuringExport: false };
    connections = [];
    savedKey = null;
    new Directory(FOLDER).delete();
    jest.mocked(SecureStore.getItemAsync).mockReset();
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async () => savedKey);
    jest.mocked(SecureStore.setItemAsync).mockReset();
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (_name, value) => {
      savedKey = value;
    });
    jest.mocked(openDatabaseAsync).mockReset();
    jest.mocked(openDatabaseAsync).mockImplementation(async (name) => {
      const connection = new FakeConnection(name, phone);
      connections.push(connection);
      return connection as unknown as SQLiteDatabase;
    });
  });

  function open() {
    return openEncryptedDatabase(NAME) as unknown as Promise<FakeConnection>;
  }

  function closedAll() {
    return connections.every((connection) => connection.closed);
  }

  it('encrypts a new file with a new key that only stays on this phone', async () => {
    const db = await open();
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), NEW_KEY, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    expect((await load(NAME)).key).toBe(NEW_KEY);
    expect(db.key).toBe(NEW_KEY);
    expect(db.closed).toBe(false);
    expect(fileAt(COPY).exists).toBe(false);
  });

  it('opens an encrypted file with its saved key and leaves the file alone', async () => {
    savedKey = OLD_KEY;
    save(NAME, { key: OLD_KEY, rows: 3, version: 5 });
    const db = await open();
    expect(db.key).toBe(OLD_KEY);
    expect(connections).toHaveLength(1);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(await load(NAME)).toEqual({ key: OLD_KEY, rows: 3, version: 5 });
  });

  it('keeps every record and the version when it encrypts a plain file', async () => {
    save(NAME, { key: null, rows: 12, version: 5 });
    const db = await open();
    expect(await load(NAME)).toEqual({ key: NEW_KEY, rows: 12, version: 5 });
    expect(db.key).toBe(NEW_KEY);
    expect(fileAt(COPY).exists).toBe(false);
  });

  it('removes what a plain file leaves beside it, so nothing plain stays', async () => {
    save(NAME, { key: null, rows: 1, version: 5 });
    fileAt(`${NAME}-wal`).write('plain pages');
    fileAt(`${NAME}-shm`).write('plain index');
    await open();
    expect(fileAt(`${NAME}-wal`).exists).toBe(false);
    expect(fileAt(`${NAME}-shm`).exists).toBe(false);
  });

  it('saves the key before anything is encrypted with it', async () => {
    save(NAME, { key: null, rows: 1, version: 5 });
    jest.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('No secure storage'));
    await expect(open()).rejects.toThrow('No secure storage');
    expect(await load(NAME)).toEqual({ key: null, rows: 1, version: 5 });
    expect(fileAt(COPY).exists).toBe(false);
    expect(closedAll()).toBe(true);
  });

  it('uses the saved key if the file is still plain, and does not make another', async () => {
    savedKey = OLD_KEY;
    save(NAME, { key: null, rows: 4, version: 5 });
    const db = await open();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(await load(NAME)).toEqual({ key: OLD_KEY, rows: 4, version: 5 });
    expect(db.key).toBe(OLD_KEY);
  });

  it('says locked and changes nothing when the key is gone', async () => {
    save(NAME, { key: OLD_KEY, rows: 3, version: 5 });
    await expect(open()).rejects.toBeInstanceOf(DatabaseLockedError);
    expect(await load(NAME)).toEqual({ key: OLD_KEY, rows: 3, version: 5 });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(closedAll()).toBe(true);
  });

  it('says locked and keeps the saved key when it is the wrong one', async () => {
    savedKey = NEW_KEY;
    save(NAME, { key: OLD_KEY, rows: 3, version: 5 });
    await expect(open()).rejects.toBeInstanceOf(DatabaseLockedError);
    expect(savedKey).toBe(NEW_KEY);
    expect(await load(NAME)).toEqual({ key: OLD_KEY, rows: 3, version: 5 });
    expect(closedAll()).toBe(true);
  });

  it('does not make a new key when the secure storage fails', async () => {
    save(NAME, { key: OLD_KEY, rows: 3, version: 5 });
    jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('Storage is unavailable'));
    await expect(open()).rejects.toThrow('Storage is unavailable');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(await load(NAME)).toEqual({ key: OLD_KEY, rows: 3, version: 5 });
    expect(closedAll()).toBe(true);
  });

  it('passes on any other error when reading the file, instead of calling it locked', async () => {
    savedKey = OLD_KEY;
    save(NAME, { key: OLD_KEY, rows: 3, version: 5 });
    const read = jest
      .spyOn(FakeConnection.prototype, 'getFirstAsync')
      .mockImplementation(async (sql) => {
        if (sql === 'PRAGMA cipher_version') {
          return { cipher_version: '4.10.0' };
        }
        throw new Error('disk I/O error');
      });
    await expect(open()).rejects.toThrow('disk I/O error');
    read.mockRestore();
    expect(closedAll()).toBe(true);
  });

  it('throws away a half made copy left beside the plain file, and starts again', async () => {
    save(NAME, { key: null, rows: 12, version: 5 });
    save(COPY, { key: OLD_KEY, rows: 2, version: 0 });
    fileAt(`${COPY}-journal`).write('half done');
    await open();
    expect(await load(NAME)).toEqual({ key: NEW_KEY, rows: 12, version: 5 });
    expect(fileAt(COPY).exists).toBe(false);
    expect(fileAt(`${COPY}-journal`).exists).toBe(false);
  });

  it('finishes the job when the copy was done and the plain file already gone', async () => {
    savedKey = OLD_KEY;
    save(COPY, { key: OLD_KEY, rows: 12, version: 5 });
    const db = await open();
    expect(await load(NAME)).toEqual({ key: OLD_KEY, rows: 12, version: 5 });
    expect(db.key).toBe(OLD_KEY);
    expect(fileAt(COPY).exists).toBe(false);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('keeps the plain file when the copy comes out short', async () => {
    phone.rowsLostInCopy = 1;
    save(NAME, { key: null, rows: 12, version: 5 });
    await expect(open()).rejects.toThrow('missing rows');
    expect(await load(NAME)).toEqual({ key: null, rows: 12, version: 5 });
    expect(closedAll()).toBe(true);
  });

  it('keeps the plain file and the key when the copy gets cut off, and works next time', async () => {
    phone.dieDuringExport = true;
    save(NAME, { key: null, rows: 12, version: 5 });
    await expect(open()).rejects.toThrow('Cut off');
    expect(await load(NAME)).toEqual({ key: null, rows: 12, version: 5 });
    expect(savedKey).toBe(NEW_KEY);

    phone.dieDuringExport = false;
    await open();
    expect(await load(NAME)).toEqual({ key: NEW_KEY, rows: 12, version: 5 });
  });

  it("leaves the file alone when it can't fold the WAL back in", async () => {
    phone.journalMode = 'wal';
    save(NAME, { key: null, rows: 12, version: 5 });
    await expect(open()).rejects.toThrow('still in use');
    expect(await load(NAME)).toEqual({ key: null, rows: 12, version: 5 });
    expect(fileAt(COPY).exists).toBe(false);
  });

  it('only makes one key when two opens start together', async () => {
    const [first, second] = await Promise.all([open(), open()]);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(first.key).toBe(NEW_KEY);
    expect(second.key).toBe(NEW_KEY);
  });

  it('still opens after an open that failed', async () => {
    save(NAME, { key: OLD_KEY, rows: 3, version: 5 });
    await expect(open()).rejects.toBeInstanceOf(DatabaseLockedError);
    savedKey = OLD_KEY;
    expect((await open()).key).toBe(OLD_KEY);
  });

  describe('in a build with no SQLCipher', () => {
    const globals = globalThis as unknown as { __DEV__: boolean };

    beforeEach(() => {
      phone.hasCipher = false;
      save(NAME, { key: null, rows: 3, version: 5 });
    });

    afterEach(() => {
      globals.__DEV__ = true;
    });

    it('stays plain while developing, like in Expo Go', async () => {
      const db = await open();
      expect(db.closed).toBe(false);
      expect(db.key).toBeNull();
      expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
      expect(await load(NAME)).toEqual({ key: null, rows: 3, version: 5 });
    });

    it('refuses to open in a real build, so records never get saved plain by mistake', async () => {
      globals.__DEV__ = false;
      await expect(open()).rejects.toThrow('no SQLCipher');
      expect(closedAll()).toBe(true);
    });
  });

  describe('unlockConnection', () => {
    function connection() {
      save(NAME, { key: OLD_KEY, rows: 3, version: 5 });
      return new FakeConnection(NAME, phone);
    }

    it('gives a new connection the saved key', async () => {
      savedKey = OLD_KEY;
      const db = connection();
      await unlockConnection(db as unknown as SQLiteDatabase);
      expect(db.key).toBe(OLD_KEY);
    });

    it('does nothing in a build with no SQLCipher', async () => {
      phone.hasCipher = false;
      const db = connection();
      await unlockConnection(db as unknown as SQLiteDatabase);
      expect(db.key).toBeNull();
      expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    });
  });
});

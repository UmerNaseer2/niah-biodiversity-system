import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { defaultDatabaseDirectory, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

// Keeps the records file encrypted with SQLCipher, so a copy of the file is no use without the key
// in the phone's secure storage. docs/security/encryption-at-rest.md explains the choices.
// SQLCipher isn't in Expo Go or the Jest stand-in, so they keep a plain file (see openUnlocked).

const KEY_NAME = 'niah.records.database-key.v1';

// THIS_DEVICE_ONLY means the key never moves to another phone in a backup, even though the file
// can. AFTER_FIRST_UNLOCK means a sync still works with the screen locked.
const KEY_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/**
 * The file is encrypted and its key isn't on this phone, like after restoring a backup onto a new
 * one. Trying again won't help, so the app tells this apart from other errors.
 */
export class DatabaseLockedError extends Error {
  constructor() {
    super('The records file is encrypted and this phone no longer has the key to it.');
    this.name = 'DatabaseLockedError';
  }
}

function fileFor(name: string) {
  return new File(`file://${defaultDatabaseDirectory}/${name}`);
}

function encryptingName(name: string) {
  return `encrypting-${name}`;
}

/** The main file goes last, so if this gets cut off the file is still seen as being there. */
function removeFiles(name: string) {
  for (const suffix of ['-wal', '-shm', '-journal', '']) {
    const file = fileFor(`${name}${suffix}`);
    if (file.exists) {
      file.delete();
    }
  }
}

/** The x'...' tells SQLCipher it's already a full strength key, so it doesn't stretch it again. */
function rawKey(key: string) {
  return `"x'${key}'"`;
}

async function hasCipher(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  return Boolean(row?.cipher_version);
}

/** SQLITE_NOTADB. Both phones put SQLite's own message for it in the error. */
function isWrongKeyError(error: unknown) {
  return error instanceof Error && /file is not a database/i.test(error.message);
}

/** Whether this connection can read the file. Any other problem isn't about the key, so it throws. */
async function canRead(db: SQLiteDatabase) {
  try {
    await db.getFirstAsync('SELECT count(*) FROM sqlite_master');
    return true;
  } catch (error) {
    if (isWrongKeyError(error)) {
      return false;
    }
    throw error;
  }
}

/** Saved before it's used, so the file can't end up encrypted with a key that got lost. */
async function makeKey() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, key, KEY_OPTIONS);
  return key;
}

/**
 * Sorts out an encryption that got cut off, for example by the phone dying. The plain file only
 * gets deleted after the copy is finished, so with no plain file the copy is good and only needs
 * its name. With both there, the copy might be half done, and the plain file still has everything.
 * It runs before the first open, because opening would make an empty file with the real name.
 */
async function finishCutOffEncryption(name: string) {
  const copy = encryptingName(name);
  if (!fileFor(copy).exists) {
    return;
  }
  if (fileFor(name).exists) {
    removeFiles(copy);
  } else {
    await fileFor(copy).move(fileFor(name));
  }
}

/** Throws unless every table came across with all its rows. The plain file is deleted after this. */
async function checkCopy(db: SQLiteDatabase) {
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  for (const { name } of tables) {
    const row = await db.getFirstAsync<{ same: number }>(
      `SELECT (SELECT count(*) FROM main."${name}") = (SELECT count(*) FROM encrypted."${name}") AS same`,
    );
    if (!row?.same) {
      throw new Error(`The encrypted copy of the ${name} table is missing rows.`);
    }
  }
}

/**
 * Swaps a plain file for an encrypted copy and hands back a connection to the copy. PRAGMA rekey
 * can't do this, because it only works on a file that's already encrypted. The connection passed in
 * gets closed. Records can be the only copy for days, so nothing plain goes until the copy checks out.
 */
async function encryptPlainFile(db: SQLiteDatabase, name: string, key: string) {
  // Moves everything out of the WAL and removes it, so the plain file is whole from here on and
  // getting cut off at any later point loses nothing. It also means no plain WAL can be left to
  // get replayed into the encrypted file.
  const journal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode = DELETE');
  if (journal?.journal_mode !== 'delete') {
    throw new Error("The records file is still in use, so it can't be encrypted yet.");
  }
  const copy = encryptingName(name);
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA main.user_version');
  await db.execAsync(
    `ATTACH DATABASE '${defaultDatabaseDirectory}/${copy}' AS encrypted KEY ${rawKey(key)}`,
  );
  await db.execAsync("SELECT sqlcipher_export('encrypted')");
  await db.execAsync(`PRAGMA encrypted.user_version = ${version?.user_version ?? 0}`);
  await checkCopy(db);
  await db.execAsync('DETACH DATABASE encrypted');
  await db.closeAsync();

  removeFiles(name);
  await fileFor(copy).move(fileFor(name));

  const encrypted = await openDatabaseAsync(name);
  try {
    await encrypted.execAsync(`PRAGMA key = ${rawKey(key)}`);
    await encrypted.execAsync('PRAGMA journal_mode = WAL');
    return encrypted;
  } catch (error) {
    await encrypted.closeAsync().catch(() => undefined);
    throw error;
  }
}

async function openUnlocked(name: string) {
  await finishCutOffEncryption(name);
  let db = await openDatabaseAsync(name);
  try {
    if (!(await hasCipher(db))) {
      // Expo Go has no SQLCipher and no way to add it, and the team tests in it with made up
      // records. A real build always has it, so one without must not quietly save plain records.
      if (!__DEV__) {
        throw new Error("This build of the app has no SQLCipher, so it can't open the records.");
      }
      return db;
    }

    // If reading the key throws, the secure storage has a problem and the key may still be there.
    // That throw has to stop this, because going on would make a second key and strand the first.
    const key = await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS);
    if (key) {
      await db.execAsync(`PRAGMA key = ${rawKey(key)}`);
      if (await canRead(db)) {
        return db;
      }
      // It might be a plain file from before the key was used. A connection can't drop a key once
      // it has one, so it takes a new connection to look.
      await db.closeAsync();
      db = await openDatabaseAsync(name);
    }
    if (!(await canRead(db))) {
      throw new DatabaseLockedError();
    }
    return await encryptPlainFile(db, name, key ?? (await makeKey()));
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
}

let lastOpen: Promise<unknown> = Promise.resolve();

/**
 * Opens the file with its key, encrypting it first if it's still plain. One at a time, because two
 * of these running together could each make a key and encrypt the same file.
 */
export function openEncryptedDatabase(name: string) {
  const open = () => openUnlocked(name);
  const opening = lastOpen.then(open, open);
  lastOpen = opening;
  return opening;
}

/**
 * Gives a new connection the key. expo-sqlite opens one for every withExclusiveTransactionAsync, and
 * it can't read the file without this. It's safe after that function's BEGIN, for the same reason
 * as the busy_timeout in records-store.ts: a plain BEGIN doesn't touch the file.
 */
export async function unlockConnection(db: SQLiteDatabase) {
  if (!(await hasCipher(db))) {
    return;
  }
  const key = await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS);
  if (key) {
    await db.execAsync(`PRAGMA key = ${rawKey(key)}`);
  }
}

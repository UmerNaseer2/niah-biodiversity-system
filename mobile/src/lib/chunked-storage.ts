// Stores values that can be too big for one secure storage item. SecureStore can turn down a big
// value (some iOS versions stopped at about 2048 bytes), and a Supabase session is bigger than
// that, so one value gets split across a few items.
//
// There are two sets of parts, a and b, and a small head item says which set is current. A new
// value goes into the other set first and the head only moves once all of it is written, so if
// the phone dies halfway the old session still works. Signing a ranger out in the forest, where
// they can't sign back in, is the failure this is here to stop.

/** What's needed from expo-secure-store, so the tests can use a fake one. */
export type SecureVault = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

/** The storage Supabase Auth asks for, also used for the saved account. */
export type TextStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/** Well under the 2048 bytes, and values are plain ASCII by then so characters are bytes. */
export const PART_LENGTH = 1800;

/** About 14 KB. A session is a few KB, and a limit means removing a value has a known end. */
export const MAX_PARTS = 8;

export const TOO_BIG = 'That value is too big to keep in secure storage.';

type Generation = 'a' | 'b';
type Head = { generation: Generation; parts: number };

const headKey = (key: string) => `${key}.head`;
const partKey = (key: string, generation: Generation, index: number) =>
  `${key}.${generation}.${index}`;

function readHead(text: string | null): Head | null {
  const match = /^([ab]):(\d+)$/.exec(text ?? '');
  if (!match) {
    return null;
  }
  const parts = Number(match[2]);
  return parts >= 1 && parts <= MAX_PARTS ? { generation: match[1] as Generation, parts } : null;
}

export function chunkedStorage(vault: SecureVault): TextStorage {
  // Supabase can refresh the session while something else reads it. One at a time means a read
  // never sees a set of parts that's still being written.
  let queue: Promise<unknown> = Promise.resolve();
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.catch(() => undefined);
    return result;
  }

  return {
    getItem: (key) =>
      inTurn(async () => {
        const head = readHead(await vault.getItemAsync(headKey(key)));
        if (!head) {
          return null;
        }
        const parts: string[] = [];
        for (let index = 0; index < head.parts; index++) {
          const part = await vault.getItemAsync(partKey(key, head.generation, index));
          if (part === null) {
            return null;
          }
          parts.push(part);
        }
        try {
          return decodeURIComponent(parts.join(''));
        } catch {
          return null;
        }
      }),

    setItem: (key, value) =>
      inTurn(async () => {
        // Encoded so every character is one byte, and so the limit means the same on both phones.
        const encoded = encodeURIComponent(value);
        const count = Math.max(1, Math.ceil(encoded.length / PART_LENGTH));
        if (count > MAX_PARTS) {
          throw new Error(TOO_BIG);
        }
        const head = readHead(await vault.getItemAsync(headKey(key)));
        const generation: Generation = head?.generation === 'a' ? 'b' : 'a';
        for (let index = 0; index < count; index++) {
          const start = index * PART_LENGTH;
          await vault.setItemAsync(
            partKey(key, generation, index),
            encoded.slice(start, start + PART_LENGTH),
          );
        }
        await vault.setItemAsync(headKey(key), `${generation}:${count}`);
        if (head) {
          // The new value is safe by now, so failing to tidy up the old one isn't an error.
          for (let index = 0; index < head.parts; index++) {
            await vault
              .deleteItemAsync(partKey(key, head.generation, index))
              .catch(() => undefined);
          }
        }
      }),

    removeItem: (key) =>
      inTurn(async () => {
        await vault.deleteItemAsync(headKey(key));
        // Every part of both sets, so nothing a phone died halfway through writing stays behind.
        for (const generation of ['a', 'b'] as const) {
          for (let index = 0; index < MAX_PARTS; index++) {
            await vault.deleteItemAsync(partKey(key, generation, index));
          }
        }
      }),
  };
}

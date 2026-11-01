import {
  chunkedStorage,
  MAX_PARTS,
  PART_LENGTH,
  TOO_BIG,
  type SecureVault,
} from '@/lib/chunked-storage';

// A stand-in for expo-secure-store. failOn makes one write throw, the way a phone dying or running
// out of keychain would, counting from the first write after it's set.
function fakeVault() {
  const items = new Map<string, string>();
  const control = { failOn: 0, writes: 0, failDeletes: false };
  const vault: SecureVault = {
    getItemAsync: async (key) => items.get(key) ?? null,
    setItemAsync: async (key, value) => {
      control.writes++;
      if (control.writes === control.failOn) {
        throw new Error('The keychain said no.');
      }
      items.set(key, value);
    },
    deleteItemAsync: async (key) => {
      if (control.failDeletes) {
        throw new Error('The keychain said no.');
      }
      items.delete(key);
    },
  };
  return { vault, items, control };
}

const BIG = 'x'.repeat(PART_LENGTH * 3 + 5);

describe('chunkedStorage', () => {
  it('gives back what went in, and null for what never did', async () => {
    const storage = chunkedStorage(fakeVault().vault);
    expect(await storage.getItem('session')).toBeNull();
    await storage.setItem('session', 'hello');
    expect(await storage.getItem('session')).toBe('hello');
  });

  it('splits a big value so no single item is over the limit', async () => {
    const { vault, items } = fakeVault();
    const storage = chunkedStorage(vault);
    await storage.setItem('session', BIG);
    expect(await storage.getItem('session')).toBe(BIG);
    // Three full parts, a short one and the head.
    expect(items.size).toBe(5);
    for (const value of items.values()) {
      expect(value.length).toBeLessThanOrEqual(PART_LENGTH);
    }
  });

  it('keeps every part in bytes even when the value has non-English letters in it', async () => {
    const { vault, items } = fakeVault();
    const storage = chunkedStorage(vault);
    const name = 'Pokok Ñ 香港 '.repeat(100);
    await storage.setItem('session', name);
    expect(await storage.getItem('session')).toBe(name);
    for (const value of items.values()) {
      // Plain ASCII, so the length is the number of bytes as well.
      expect(value).toMatch(/^[ -~]*$/);
      expect(value.length).toBeLessThanOrEqual(PART_LENGTH);
    }
  });

  it('handles an empty value', async () => {
    const storage = chunkedStorage(fakeVault().vault);
    await storage.setItem('session', '');
    expect(await storage.getItem('session')).toBe('');
  });

  it('only uses characters SecureStore allows in its keys', async () => {
    const { vault, items } = fakeVault();
    await chunkedStorage(vault).setItem('niah-session', BIG);
    for (const key of items.keys()) {
      expect(key).toMatch(/^[\w.-]+$/);
    }
  });

  it('removes the old parts when a smaller value replaces a big one', async () => {
    const { vault, items } = fakeVault();
    const storage = chunkedStorage(vault);
    await storage.setItem('session', BIG);
    await storage.setItem('session', 'small');
    expect(await storage.getItem('session')).toBe('small');
    expect(items.size).toBe(2);
  });

  it.each([1, 2, 3, 4, 5])(
    'still has the old value if write number %i of a new one fails',
    async (failOn) => {
      const { vault, control } = fakeVault();
      const storage = chunkedStorage(vault);
      await storage.setItem('session', 'the old session');
      control.writes = 0;
      control.failOn = failOn;

      await expect(storage.setItem('session', BIG)).rejects.toThrow('The keychain said no.');
      expect(await storage.getItem('session')).toBe('the old session');
    },
  );

  it('can save again after a write failed', async () => {
    const { vault, control } = fakeVault();
    const storage = chunkedStorage(vault);
    await storage.setItem('session', 'the old session');
    control.writes = 0;
    control.failOn = 1;
    await expect(storage.setItem('session', BIG)).rejects.toThrow();
    await storage.setItem('session', BIG);
    expect(await storage.getItem('session')).toBe(BIG);
  });

  it("doesn't fail when it can't tidy up after the new value is safe", async () => {
    const { vault, control } = fakeVault();
    const storage = chunkedStorage(vault);
    await storage.setItem('session', 'the old session');
    control.failDeletes = true;
    await storage.setItem('session', 'the new session');
    expect(await storage.getItem('session')).toBe('the new session');
  });

  it('turns down a value over the limit and keeps the old one', async () => {
    const storage = chunkedStorage(fakeVault().vault);
    await storage.setItem('session', 'the old session');
    await expect(
      storage.setItem('session', 'x'.repeat(PART_LENGTH * MAX_PARTS + 1)),
    ).rejects.toThrow(TOO_BIG);
    expect(await storage.getItem('session')).toBe('the old session');
  });

  it('removes everything, including parts left by a write that died halfway', async () => {
    const { vault, items, control } = fakeVault();
    const storage = chunkedStorage(vault);
    await storage.setItem('session', 'the old session');
    control.writes = 0;
    control.failOn = 3;
    await expect(storage.setItem('session', BIG)).rejects.toThrow();
    expect(items.size).toBeGreaterThan(2);

    await storage.removeItem('session');
    expect(items.size).toBe(0);
    expect(await storage.getItem('session')).toBeNull();
  });

  it('reads as nothing if a part has gone missing', async () => {
    const { vault, items } = fakeVault();
    const storage = chunkedStorage(vault);
    await storage.setItem('session', BIG);
    items.delete('session.a.1');
    expect(await storage.getItem('session')).toBeNull();
  });

  it.each(['junk', 'c:1', 'a:0', `a:${MAX_PARTS + 1}`])(
    'reads as nothing if the head item says %s',
    async (head) => {
      const { vault, items } = fakeVault();
      const storage = chunkedStorage(vault);
      await storage.setItem('session', 'hello');
      items.set('session.head', head);
      expect(await storage.getItem('session')).toBeNull();
    },
  );

  it('reads as nothing if a part is cut off in the middle of a character', async () => {
    const { vault, items } = fakeVault();
    const storage = chunkedStorage(vault);
    await storage.setItem('session', 'hello');
    items.set('session.a.0', '%E0%A4');
    expect(await storage.getItem('session')).toBeNull();
  });

  it('never lets a read see a value that is still being written', async () => {
    const storage = chunkedStorage(fakeVault().vault);
    await storage.setItem('session', 'old');
    const [, seen, last] = await Promise.all([
      storage.setItem('session', BIG),
      storage.getItem('session'),
      storage.setItem('session', 'last').then(() => storage.getItem('session')),
    ]);
    expect(seen).toBe(BIG);
    expect(last).toBe('last');
  });

  it('keeps two values apart', async () => {
    const storage = chunkedStorage(fakeVault().vault);
    await storage.setItem('one', 'first');
    await storage.setItem('two', 'second');
    await storage.removeItem('one');
    expect(await storage.getItem('one')).toBeNull();
    expect(await storage.getItem('two')).toBe('second');
  });
});

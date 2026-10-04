import { matchesTag, newId, tagCodeFor } from '@/lib/id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('makes v4 UUIDs that do not repeat', () => {
    const ids = Array.from({ length: 500 }, () => newId());
    ids.forEach((id) => expect(id).toMatch(UUID_V4));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('still makes v4 UUIDs when crypto.randomUUID is missing', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const ids = Array.from({ length: 500 }, () => newId());
      ids.forEach((id) => expect(id).toMatch(UUID_V4));
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'crypto', original);
      } else {
        delete (globalThis as { crypto?: unknown }).crypto;
      }
    }
  });
});

describe('tagCodeFor', () => {
  it('puts NNP- in front of the first 6 characters of the ID', () => {
    expect(tagCodeFor('3f2a9c4e-8b1d-4c6a-9e2f-7a1b5c3d9e01')).toBe('NNP-3F2A9C');
  });
});

describe('matchesTag', () => {
  const record = { id: '3f2a9c4e-8b1d-4c6a-9e2f-7a1b5c3d9e01', tagCode: 'NNP-3F2A9C' };

  it.each(['NNP-3F2A9C', 'nnp-3f2a9c', 'NNP 3F2A9C', ' nnp3f2a9c ', '3F2A9C', '3f2a9c'])(
    'finds the plant when the tag is typed as %p',
    (input) => {
      expect(matchesTag(record, input)).toBe(true);
    },
  );

  it('finds the plant from its full record ID', () => {
    expect(matchesTag(record, record.id)).toBe(true);
    expect(matchesTag(record, record.id.toUpperCase())).toBe(true);
  });

  it.each(['', '3F2A9', 'NNP-3F2A', 'NNP-3F2A9D', '3F2A9C4E'])(
    'does not match a short, wrong or half typed code like %p',
    (input) => {
      expect(matchesTag(record, input)).toBe(false);
    },
  );
});

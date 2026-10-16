import { newId, tagCodeFor } from '@/lib/id';
import { isNewScan, MAX_QR_LENGTH, parseTagQr, RESCAN_AFTER_MS } from '@/lib/qr';

describe('parseTagQr', () => {
  it.each(['NNP-3F2A9C', 'nnp-3f2a9c', 'NNP3F2A9C', 'NNP 3F2A9C', '  NNP-3F2A9C\n', 'Nnp-3f2A9c'])(
    'reads a tag code on its own, written as %p',
    (data) => {
      expect(parseTagQr(data)).toBe('NNP-3F2A9C');
    },
  );

  it.each([
    'https://niah.example.org/tag/NNP-3F2A9C',
    'http://niah.example.org/tag/NNP-3F2A9C',
    'https://niah.example.org/tag/nnp-3f2a9c/',
    'https://niah.example.org/tag/NNP-3F2A9C?from=qr',
    'https://niah.example.org/tag/NNP-3F2A9C#plant',
    'https://niah.example.org:3000/park/tag/NNP-3F2A9C',
    'HTTPS://NIAH.EXAMPLE.ORG/tag/NNP-3F2A9C',
    'https://niah.example.org/tag/3f2a9c',
    'https://niah.example.org/tag/NNP%2D3F2A9C',
    ' https://niah.example.org/tag/NNP-3F2A9C\n',
  ])('reads the tag code out of a website link like %p', (data) => {
    expect(parseTagQr(data)).toBe('NNP-3F2A9C');
  });

  it.each([
    ['an empty QR code', ''],
    ['6 characters without NNP', '3F2A9C'],
    ['an IoT sensor code', 'NNP-IOT-01'],
    ['a code that is too short', 'NNP-3F2A9'],
    ['a code that is too long', 'NNP-3F2A9C4'],
    ['a code with other symbols in it', 'NNP-3F2A_C'],
    ['plain text', 'Hello from Niah'],
    ['a code inside other text', 'Tag: NNP-3F2A9C'],
    ['a Wi-Fi QR code', 'WIFI:T:WPA;S:ParkOffice;P:secret;;'],
    ['a link to some other page', 'https://example.com/plants/NNP-3F2A9C'],
    ['a link with no code', 'https://niah.example.org/tag/'],
    ['a link with more path after the code', 'https://niah.example.org/tag/NNP-3F2A9C/edit'],
    ['a link with a bad code', 'https://niah.example.org/tag/NNP-3F2A'],
    ['a link with a broken % sequence', 'https://niah.example.org/tag/NNP-3F2A9C%E0%A4%A'],
    ['an ftp link', 'ftp://niah.example.org/tag/NNP-3F2A9C'],
    ['a javascript link', 'javascript:alert(1)//tag/NNP-3F2A9C'],
  ])('turns down %s', (_what, data) => {
    expect(parseTagQr(data)).toBeUndefined();
  });

  it(`doesn't read anything longer than ${MAX_QR_LENGTH} characters`, () => {
    const padding = ' '.repeat(MAX_QR_LENGTH);
    expect(parseTagQr(`NNP-3F2A9C${padding}`)).toBeUndefined();
    expect(parseTagQr(`NNP-3F2A9C${padding.slice(10)}`)).toBe('NNP-3F2A9C');
  });

  it('reads back the code made for a new record', () => {
    for (let i = 0; i < 50; i++) {
      const tag = tagCodeFor(newId());
      expect(parseTagQr(tag)).toBe(tag);
    }
  });
});

describe('isNewScan', () => {
  it('counts the first sighting of a code', () => {
    const seen = new Map<string, number>();
    expect(isNewScan(seen, 'NNP-3F2A9C', 1000)).toBe(true);
    expect(seen.get('NNP-3F2A9C')).toBe(1000);
  });

  it("doesn't count a code again while it stays in view", () => {
    const seen = new Map<string, number>();
    expect(isNewScan(seen, 'NNP-3F2A9C', 0)).toBe(true);
    // The camera sees it every 100 ms for 10 seconds.
    for (let now = 100; now <= 10_000; now += 100) {
      expect(isNewScan(seen, 'NNP-3F2A9C', now)).toBe(false);
    }
  });

  it('counts a code again once it has been out of view long enough', () => {
    const seen = new Map<string, number>();
    isNewScan(seen, 'NNP-3F2A9C', 0);
    expect(isNewScan(seen, 'NNP-3F2A9C', RESCAN_AFTER_MS - 1)).toBe(false);
    expect(isNewScan(seen, 'NNP-3F2A9C', 2 * RESCAN_AFTER_MS - 1)).toBe(true);
  });

  it('keeps track of two codes in view at the same time', () => {
    const seen = new Map<string, number>();
    expect(isNewScan(seen, 'NNP-3F2A9C', 0)).toBe(true);
    expect(isNewScan(seen, 'NNP-8C41E7', 50)).toBe(true);
    expect(isNewScan(seen, 'NNP-3F2A9C', 100)).toBe(false);
    expect(isNewScan(seen, 'NNP-8C41E7', 150)).toBe(false);
  });

  it('forgets codes that left the view a while ago', () => {
    const seen = new Map<string, number>();
    isNewScan(seen, 'NNP-3F2A9C', 0);
    isNewScan(seen, 'NNP-8C41E7', 1000);
    isNewScan(seen, 'NNP-B17D03', RESCAN_AFTER_MS);
    expect([...seen.keys()]).toEqual(['NNP-8C41E7', 'NNP-B17D03']);
  });
});

import { MAX_HEIGHT_M, parseHeight } from '@/lib/height';

describe('parseHeight', () => {
  it('lets the box stay empty because height is optional', () => {
    expect(parseHeight('')).toEqual({ valid: true });
    expect(parseHeight('   ')).toEqual({ valid: true });
  });

  it.each([
    { text: '12.5', value: 12.5 },
    { text: '12,5', value: 12.5 },
    { text: ' 7 ', value: 7 },
    { text: '12.', value: 12 },
    { text: '.5', value: 0.5 },
    { text: String(MAX_HEIGHT_M), value: MAX_HEIGHT_M },
  ])('reads "$text" as $value', ({ text, value }) => {
    expect(parseHeight(text)).toEqual({ valid: true, value });
  });

  it.each(['0', '0.0', '-3', String(MAX_HEIGHT_M + 1), '1000'])(
    'rejects %p because it is not a real tree height',
    (text) => {
      expect(parseHeight(text).valid).toBe(false);
    },
  );

  // Number() would take some of these, but nobody means them as a height.
  it.each(['1e2', '0x10', '+5', 'Infinity', '1.2.3', '1,2,3', '.', 'abc', '12 m'])(
    'rejects %p because it is not a plain number',
    (text) => {
      expect(parseHeight(text).valid).toBe(false);
    },
  );
});

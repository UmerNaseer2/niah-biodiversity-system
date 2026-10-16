import { heightErrorMessage, MAX_HEIGHT_M, parseHeight } from '@/lib/height';

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
    { text: '12.25', value: 12.25 },
    { text: '0.01', value: 0.01 },
    { text: '12.500', value: 12.5 },
    { text: String(MAX_HEIGHT_M), value: MAX_HEIGHT_M },
    { text: `${MAX_HEIGHT_M}.00`, value: MAX_HEIGHT_M },
  ])('reads "$text" as $value', ({ text, value }) => {
    expect(parseHeight(text)).toEqual({ valid: true, value });
  });

  it.each(['0', '0.0', '-3', String(MAX_HEIGHT_M + 1), `${MAX_HEIGHT_M}.01`, '1000'])(
    'rejects %p because it is not a real tree height',
    (text) => {
      const result = parseHeight(text);
      expect(result.valid).toBe(false);
      // A minus sign isn't a digit, so "-3" fails on the format before the range.
      expect(result).toHaveProperty('problem', text === '-3' ? 'format' : 'range');
    },
  );

  // The database keeps 2 decimal places, so anything finer would be rounded off.
  it.each(['12.345', '0.001', '7,125'])('rejects %p because it has too many decimals', (text) => {
    expect(parseHeight(text)).toEqual({ valid: false, problem: 'decimals' });
  });

  // Number() would take some of these, but nobody means them as a height.
  it.each(['1e2', '0x10', '+5', 'Infinity', '1.2.3', '1,2,3', '.', 'abc', '12 m'])(
    'rejects %p because it is not a plain number',
    (text) => {
      expect(parseHeight(text)).toEqual({ valid: false, problem: 'format' });
    },
  );
});

describe('heightErrorMessage', () => {
  it('says what to fix for each problem', () => {
    expect(heightErrorMessage('decimals')).toBe('Use 2 decimal places at most, like 12.25');
    expect(heightErrorMessage('range')).toBe(
      `Enter a height in metres between 0 and ${MAX_HEIGHT_M}, like 12.5`,
    );
    expect(heightErrorMessage('format')).toBe(heightErrorMessage('range'));
  });
});

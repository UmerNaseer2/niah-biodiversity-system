import queryString from 'query-string';

// Expo Router reads every link that opens the app through query-string 7. package.json moves its
// decoder to a version with the slow decoding fixed, and that version only has a default export,
// so patches/ changes the one line in query-string that loads it. These fail if either goes.
describe('reading the query part of a link', () => {
  it('decodes normal text', () => {
    expect(queryString.parse('tag=NNP-3F2A9C&name=Stand%20in%20tree&note=a%C3%A5')).toEqual({
      tag: 'NNP-3F2A9C',
      name: 'Stand in tree',
      note: 'aå',
    });
  });

  it('keeps a percent sign that is not a code', () => {
    expect(queryString.parse('cover=100%')).toEqual({ cover: '100%' });
  });

  it('takes no time over a long run of bad codes', () => {
    const value = '%ff'.repeat(3000);
    const started = Date.now();
    expect(queryString.parse(`note=${value}`)).toEqual({ note: value });
    // The old version took far longer than this test run on a third of this length.
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

import { checkRecordForm, tidyName } from '@/lib/record-form';

const ready = { species: 'Shorea macrophylla', heightText: '', locating: false, hasLocation: true };

describe('checkRecordForm', () => {
  it('lets a record save with only the species filled in', () => {
    expect(checkRecordForm(ready)).toEqual({
      speciesError: undefined,
      heightError: undefined,
      heightM: undefined,
      canSave: true,
      saveHint: 'Saved on this phone first. It uploads when you sync.',
    });
  });

  it.each(['', '   ', '\n'])('needs a species name, so %p is not enough', (species) => {
    const result = checkRecordForm({ ...ready, species });
    expect(result.speciesError).toBe('Add the species name.');
    expect(result.canSave).toBe(false);
    expect(result.saveHint).toBe('Add the species name to save.');
  });

  it('passes the height on as a number', () => {
    expect(checkRecordForm({ ...ready, heightText: '12,5' }).heightM).toBe(12.5);
  });

  it('blocks saving with a height that is out of range', () => {
    const result = checkRecordForm({ ...ready, heightText: '1e2' });
    expect(result.heightError).toBe('Enter a height in metres between 0 and 120, like 12.5');
    expect(result.heightM).toBeUndefined();
    expect(result.canSave).toBe(false);
    expect(result.saveHint).toBe('Fix the height to save.');
  });

  it('asks for fewer decimals instead of rounding the height', () => {
    const result = checkRecordForm({ ...ready, heightText: '12.345' });
    expect(result.heightError).toBe('Use 2 decimal places at most, like 12.25');
    expect(result.canSave).toBe(false);
  });

  it('waits for a GPS fix that is already on its way', () => {
    const result = checkRecordForm({ ...ready, locating: true, hasLocation: false });
    expect(result.canSave).toBe(false);
    expect(result.saveHint).toBe('Waiting for the location…');
  });

  it('still saves without a location, but says to capture one', () => {
    const result = checkRecordForm({ ...ready, hasLocation: false });
    expect(result.canSave).toBe(true);
    expect(result.saveHint).toBe('You can save without a location, but try to capture one first.');
  });

  it('talks about the species first when more than one thing is wrong', () => {
    const result = checkRecordForm({ species: '', heightText: 'abc', locating: true, hasLocation: false });
    expect(result.speciesError).toBeDefined();
    expect(result.heightError).toBeDefined();
    expect(result.saveHint).toBe('Add the species name to save.');
  });
});

describe('tidyName', () => {
  it('trims the ends and squashes extra spaces', () => {
    expect(tidyName('  Shorea   macrophylla \n')).toBe('Shorea macrophylla');
    expect(tidyName('Belian')).toBe('Belian');
    expect(tidyName('   ')).toBe('');
  });
});

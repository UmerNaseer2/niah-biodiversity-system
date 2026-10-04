import {
  accuracyLevel,
  conditionLabel,
  formatCoords,
  formatHeight,
  formatRecordedAt,
  formatTime,
  isToday,
  plural,
} from '@/lib/format';

// Dates are built from local time so these pass in any time zone.
const now = new Date(2026, 9, 4, 15, 0);

function at(month: number, day: number, hours: number, minutes: number) {
  return new Date(2026, month, day, hours, minutes).toISOString();
}

describe('formatTime', () => {
  it.each([
    { hours: 0, minutes: 5, expected: '12:05 am' },
    { hours: 9, minutes: 41, expected: '9:41 am' },
    { hours: 12, minutes: 0, expected: '12:00 pm' },
    { hours: 23, minutes: 59, expected: '11:59 pm' },
  ])('shows $expected', ({ hours, minutes, expected }) => {
    expect(formatTime(at(9, 4, hours, minutes))).toBe(expected);
  });
});

describe('formatRecordedAt', () => {
  it('says Today for records from today', () => {
    expect(formatRecordedAt(at(9, 4, 9, 41), now)).toBe('Today, 9:41 am');
  });

  it('says Yesterday for records from the day before', () => {
    expect(formatRecordedAt(at(9, 3, 15, 20), now)).toBe('Yesterday, 3:20 pm');
  });

  it('works out yesterday across the end of a month', () => {
    const firstOfOctober = new Date(2026, 9, 1, 8, 0);
    expect(formatRecordedAt(at(8, 30, 18, 0), firstOfOctober)).toBe('Yesterday, 6:00 pm');
  });

  it('shows the date for anything older', () => {
    expect(formatRecordedAt(at(9, 1, 10, 5), now)).toBe('1 Oct, 10:05 am');
  });
});

describe('isToday', () => {
  it('only counts records from the same calendar day', () => {
    expect(isToday(at(9, 4, 0, 1), now)).toBe(true);
    expect(isToday(at(9, 3, 23, 59), now)).toBe(false);
  });
});

describe('formatCoords', () => {
  it('rounds to 5 decimal places and adds the compass letters', () => {
    expect(formatCoords({ latitude: 1.234567, longitude: 110.5 })).toBe(
      '1.23457° N, 110.50000° E',
    );
    expect(formatCoords({ latitude: -2.5, longitude: -45.123454 })).toBe(
      '2.50000° S, 45.12345° W',
    );
  });
});

describe('formatHeight', () => {
  it('shows metres, or says when the height was skipped', () => {
    expect(formatHeight(12.5)).toBe('12.5 m');
    expect(formatHeight(undefined)).toBe('Not measured');
  });
});

describe('accuracyLevel', () => {
  it.each([
    { accuracyM: 4, level: 'good' },
    { accuracyM: 10, level: 'good' },
    { accuracyM: 11, level: 'ok' },
    { accuracyM: 25, level: 'ok' },
    { accuracyM: 26, level: 'poor' },
  ])('calls $accuracyM m $level', ({ accuracyM, level }) => {
    expect(accuracyLevel(accuracyM)).toBe(level);
  });
});

describe('plural', () => {
  it('only adds an s when the count is not 1', () => {
    expect(plural(0, 'record')).toBe('0 records');
    expect(plural(1, 'record')).toBe('1 record');
    expect(plural(3, 'record')).toBe('3 records');
  });
});

describe('conditionLabel', () => {
  it('capitalises the condition for the screen', () => {
    expect(conditionLabel('healthy')).toBe('Healthy');
    expect(conditionLabel('dead')).toBe('Dead');
  });
});

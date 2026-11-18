import {
  accuracyLevel,
  conditionLabel,
  formatCoords,
  formatHeight,
  formatParkDate,
  formatRecordedAt,
  formatTime,
  GOOD_ACCURACY_M,
  isToday,
  OK_ACCURACY_M,
  plural,
  startOfParkDay,
} from '@/lib/format';

// The phone shows park time (Sarawak, UTC+8) like the website, whatever zone it's set to.
// jest/time-zone.js runs the tests as a phone set to Los Angeles time, and the times here are
// written in UTC. The park is 8 hours ahead of UTC, so a park day starts at 4 pm UTC the day before.
describe('times on a phone set to another time zone', () => {
  // 1 pm on 4 Oct at the park, and still 10 pm on 3 Oct in Los Angeles.
  const now = new Date('2026-10-04T05:00:00Z');

  it('really is set to a zone far from the park', () => {
    expect(now.getTimezoneOffset()).toBe(7 * 60);
    expect(now.getDate()).toBe(3);
    expect(now.getHours()).toBe(22);
  });

  describe('formatTime', () => {
    it.each([
      { iso: '2026-10-03T16:05:00Z', expected: '12:05 am' },
      { iso: '2026-10-04T01:41:00Z', expected: '9:41 am' },
      { iso: '2026-10-04T04:00:00Z', expected: '12:00 pm' },
      { iso: '2026-10-04T15:59:00Z', expected: '11:59 pm' },
    ])('shows $iso as $expected', ({ iso, expected }) => {
      expect(formatTime(iso)).toBe(expected);
    });
  });

  describe('formatRecordedAt', () => {
    it('says Today for records from today at the park', () => {
      expect(formatRecordedAt('2026-10-04T01:41:00Z', now)).toBe('Today, 9:41 am');
      // Just after midnight at the park, which is still the day before in a lot of places.
      expect(formatRecordedAt('2026-10-03T16:00:00Z', now)).toBe('Today, 12:00 am');
    });

    it('says Yesterday for records from the day before at the park', () => {
      expect(formatRecordedAt('2026-10-03T07:20:00Z', now)).toBe('Yesterday, 3:20 pm');
      expect(formatRecordedAt('2026-10-03T15:59:00Z', now)).toBe('Yesterday, 11:59 pm');
    });

    it('works out yesterday across the end of a month', () => {
      const firstOfOctober = new Date('2026-10-01T00:00:00Z');
      expect(formatRecordedAt('2026-09-30T10:00:00Z', firstOfOctober)).toBe('Yesterday, 6:00 pm');
    });

    it('shows the date for anything older', () => {
      expect(formatRecordedAt('2026-10-01T02:05:00Z', now)).toBe('1 Oct, 10:05 am');
    });

    it('adds the year when it is not this year', () => {
      expect(formatRecordedAt('2025-12-28T08:10:00Z', now)).toBe('28 Dec 2025, 4:10 pm');
      // Yesterday still says Yesterday on the first of January.
      const newYear = new Date('2026-01-01T00:00:00Z');
      expect(formatRecordedAt('2025-12-31T14:00:00Z', newYear)).toBe('Yesterday, 10:00 pm');
    });

    it('goes by the year at the park', () => {
      // 1 am on 1 Jan 2026 at the park, while it's still 2025 in London and Los Angeles.
      const newYear = new Date('2025-12-31T17:00:00Z');
      expect(formatRecordedAt('2025-12-29T10:00:00Z', newYear)).toBe('29 Dec 2025, 6:00 pm');
    });

    it('reads a time with an offset on the end the same way', () => {
      expect(formatRecordedAt('2026-10-04T09:41:00+08:00', now)).toBe('Today, 9:41 am');
      expect(formatRecordedAt('2026-10-04T01:41:00+00:00', now)).toBe('Today, 9:41 am');
    });
  });

  describe('isToday', () => {
    it('only counts records from the same day at the park', () => {
      expect(isToday('2026-10-03T16:01:00Z', now)).toBe(true);
      expect(isToday('2026-10-04T15:59:00Z', now)).toBe(true);
      expect(isToday('2026-10-03T15:59:00Z', now)).toBe(false);
      expect(isToday('2026-10-04T16:00:00Z', now)).toBe(false);
    });
  });

  describe('startOfParkDay', () => {
    it('gives midnight at the park, which is 4 pm UTC the day before', () => {
      expect(new Date(startOfParkDay(now)).toISOString()).toBe('2026-10-03T16:00:00.000Z');
      expect(startOfParkDay(new Date('2026-10-03T16:00:00Z'))).toBe(startOfParkDay(now));
      expect(new Date(startOfParkDay(new Date('2026-10-03T15:59:00Z'))).toISOString()).toBe(
        '2026-10-02T16:00:00.000Z',
      );
    });
  });

  describe('formatParkDate', () => {
    it('gives the day at the park', () => {
      expect(formatParkDate('2026-10-01T15:59:59.000Z')).toBe('1 Oct 2026');
      expect(formatParkDate('2026-10-01T16:00:00.000Z')).toBe('2 Oct 2026');
    });

    it('reads a time with an offset on the end the same way', () => {
      expect(formatParkDate('2026-10-01T16:00:00+00:00')).toBe('2 Oct 2026');
      expect(formatParkDate('2026-10-02T00:00:00+08:00')).toBe('2 Oct 2026');
    });

    it('moves on to the next year at midnight park time', () => {
      expect(formatParkDate('2025-12-31T15:59:59.000Z')).toBe('31 Dec 2025');
      expect(formatParkDate('2025-12-31T16:30:00.000Z')).toBe('1 Jan 2026');
    });
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
  it('uses the same 15 m line as the review queue on the website', () => {
    expect(GOOD_ACCURACY_M).toBe(10);
    expect(OK_ACCURACY_M).toBe(15);
  });

  it.each([
    { accuracyM: 4, level: 'good' },
    { accuracyM: 10, level: 'good' },
    { accuracyM: 11, level: 'ok' },
    { accuracyM: 15, level: 'ok' },
    { accuracyM: 16, level: 'poor' },
    { accuracyM: 25, level: 'poor' },
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

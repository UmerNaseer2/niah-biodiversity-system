import { render, screen } from '@testing-library/react-native';

import { LocationSummary } from '@/components/location-summary';
import type { GpsReading } from '@/types/plant-record';

// 9:41 am at the park. The tests run as a phone set to Los Angeles time (jest/time-zone.js),
// where it's 6:41 pm the day before.
const location: GpsReading = {
  latitude: 3.81488,
  longitude: 113.77968,
  accuracyM: 6,
  capturedAt: '2026-10-04T01:41:00.000Z',
};

describe('LocationSummary', () => {
  it('shows when the point was captured in park time', () => {
    render(<LocationSummary location={location} />);
    expect(screen.getByText('Captured 9:41 am')).toBeVisible();
  });

  it.each([
    { accuracyM: 10, label: '±10 m · Good' },
    { accuracyM: 15, label: '±15 m · OK' },
    { accuracyM: 16, label: '±16 m · Poor' },
  ])('labels a $accuracyM m point the way the review queue would', ({ accuracyM, label }) => {
    render(<LocationSummary location={{ ...location, accuracyM }} />);
    expect(screen.getByText(label)).toBeVisible();
  });

  it('only suggests a retake once the point is over 15 m', () => {
    const tip = 'Accuracy is low. Move away from thick canopy if you can, then retake.';
    const { rerender } = render(
      <LocationSummary location={{ ...location, accuracyM: 15 }} showRetakeTip />,
    );
    expect(screen.queryByText(tip)).toBeNull();
    rerender(<LocationSummary location={{ ...location, accuracyM: 16 }} showRetakeTip />);
    expect(screen.getByText(tip)).toBeVisible();
  });
});

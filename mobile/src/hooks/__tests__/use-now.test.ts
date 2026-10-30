import { act, renderHook } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { useNow } from '@/hooks/use-now';

/** Tells every AppState listener the app is now in this state. */
function appState(state: AppStateStatus) {
  act(() => {
    for (const [event, listener] of jest.mocked(AppState.addEventListener).mock.calls) {
      if (event === 'change') {
        listener(state);
      }
    }
  });
}

const evening = new Date(2026, 9, 28, 21, 30);
const nextMorning = new Date(2026, 9, 29, 7, 15);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: evening });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useNow', () => {
  it('reads the time again when the app comes back to the front', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toEqual(evening);

    // Left in the background overnight.
    jest.setSystemTime(nextMorning);
    appState('background');
    expect(result.current).toEqual(evening);

    appState('active');
    expect(result.current).toEqual(nextMorning);
  });

  it('stops listening once the screen is gone', () => {
    const { unmount } = renderHook(() => useNow());
    const subscription = jest.mocked(AppState.addEventListener).mock.results[0].value;
    unmount();
    expect(subscription.remove).toHaveBeenCalled();
  });
});

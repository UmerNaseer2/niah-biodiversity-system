import * as Location from 'expo-location';
import { act, renderHook, waitFor } from 'expo-router/testing-library';

import { useGpsCapture } from '@/hooks/use-gps-capture';
import { FIRST_FIX_TIMEOUT_MS, IMPROVE_FOR_MS } from '@/lib/gps';

jest.mock('expo-location');

const getPermission = jest.mocked(Location.getForegroundPermissionsAsync);
const requestPermission = jest.mocked(Location.requestForegroundPermissionsAsync);
const servicesEnabled = jest.mocked(Location.hasServicesEnabledAsync);
const watchPosition = jest.mocked(Location.watchPositionAsync);
const remove = jest.fn();

function permission(
  status: Location.PermissionStatus,
  extra: Partial<Location.LocationPermissionResponse> = {},
): Location.LocationPermissionResponse {
  return {
    status,
    granted: status === Location.PermissionStatus.GRANTED,
    canAskAgain: true,
    expires: 'never',
    ...extra,
  };
}

const granted = permission(Location.PermissionStatus.GRANTED, {
  ios: { scope: 'whenInUse', accuracy: 'full' },
});

// Made-up point near the park HQ, not a real plant location.
function fix(accuracy: number | null, timestamp = Date.now()): Location.LocationObject {
  return {
    coords: {
      latitude: 3.81452,
      longitude: 113.77921,
      altitude: null,
      accuracy,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp,
  };
}

/** Sends a fix to the hook the way expo-location would. */
function sendFix(location: Location.LocationObject) {
  const onLocation = watchPosition.mock.lastCall?.[1];
  act(() => {
    onLocation?.(location);
  });
}

async function startWatching() {
  const hook = renderHook(() => useGpsCapture());
  act(() => hook.result.current.start());
  await waitFor(() => expect(hook.result.current.status).toBe('searching'));
  expect(watchPosition).toHaveBeenCalledTimes(1);
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  getPermission.mockResolvedValue(granted);
  requestPermission.mockResolvedValue(granted);
  servicesEnabled.mockResolvedValue(true);
  watchPosition.mockResolvedValue({ remove });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useGpsCapture', () => {
  it('starts with no location', () => {
    const { result } = renderHook(() => useGpsCapture());
    expect(result.current.status).toBe('idle');
    expect(result.current.location).toBeUndefined();
    expect(result.current.locating).toBe(false);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('watches with the most accurate setting and saves a fix of 10 m or better', async () => {
    const { result } = await startWatching();
    expect(watchPosition).toHaveBeenCalledWith(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 1000,
        distanceInterval: 0,
        mayShowUserSettingsDialog: false,
      },
      expect.any(Function),
      expect.any(Function),
    );
    expect(result.current.status).toBe('searching');
    expect(result.current.locating).toBe(true);
    // Permission was already given, so there's no prompt.
    expect(requestPermission).not.toHaveBeenCalled();

    sendFix(fix(4.6));
    expect(result.current.status).toBe('done');
    expect(result.current.location).toMatchObject({
      latitude: 3.81452,
      longitude: 113.77921,
      accuracyM: 5,
    });
    expect(result.current.locating).toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('asks for permission the first time', async () => {
    getPermission.mockResolvedValue(permission(Location.PermissionStatus.UNDETERMINED));
    await startWatching();
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('stops when permission is turned down', async () => {
    getPermission.mockResolvedValue(permission(Location.PermissionStatus.UNDETERMINED));
    requestPermission.mockResolvedValue(
      permission(Location.PermissionStatus.DENIED, { canAskAgain: false }),
    );
    const { result } = renderHook(() => useGpsCapture());
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(result.current.canAskAgain).toBe(false);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("doesn't ask again when the phone won't show the prompt", async () => {
    getPermission.mockResolvedValue(
      permission(Location.PermissionStatus.DENIED, { canAskAgain: false }),
    );
    const { result } = renderHook(() => useGpsCapture());
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each([
    ['iOS', { ios: { scope: 'whenInUse', accuracy: 'reduced' } }],
    ['Android', { android: { accuracy: 'coarse' } }],
  ] as const)('stops when %s only shares an approximate location', async (_platform, extra) => {
    getPermission.mockResolvedValue(permission(Location.PermissionStatus.GRANTED, extra));
    const { result } = renderHook(() => useGpsCapture());
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe('approximate'));
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('stops when location is turned off on the phone', async () => {
    servicesEnabled.mockResolvedValue(false);
    const { result } = renderHook(() => useGpsCapture());
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe('services-off'));
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('keeps improving a rough fix, then saves the best one after 30 seconds', async () => {
    jest.useFakeTimers();
    const { result } = await startWatching();

    sendFix(fix(28));
    sendFix(fix(16));
    sendFix(fix(35));
    expect(result.current.status).toBe('improving');
    expect(result.current.best?.accuracyM).toBe(16);
    expect(result.current.location).toBeUndefined();

    act(() => jest.advanceTimersByTime(IMPROVE_FOR_MS));
    expect(result.current.status).toBe('done');
    expect(result.current.location?.accuracyM).toBe(16);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('lets the user take the best fix early', async () => {
    const { result } = await startWatching();
    sendFix(fix(18));
    act(() => result.current.accept());
    expect(result.current.status).toBe('done');
    expect(result.current.location?.accuracyM).toBe(18);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('gives up when there is no fix after 3 minutes', async () => {
    jest.useFakeTimers();
    const { result } = await startWatching();

    act(() => jest.advanceTimersByTime(FIRST_FIX_TIMEOUT_MS - 1000));
    expect(result.current.status).toBe('searching');
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current.status).toBe('no-fix');
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('keeps the old location when a retake fails', async () => {
    jest.useFakeTimers();
    const { result } = await startWatching();
    sendFix(fix(6));
    const first = result.current.location;

    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('searching'));
    expect(watchPosition).toHaveBeenCalledTimes(2);
    expect(result.current.location).toBe(first);
    expect(result.current.locating).toBe(true);

    act(() => jest.advanceTimersByTime(FIRST_FIX_TIMEOUT_MS));
    expect(result.current.status).toBe('no-fix');
    expect(result.current.location).toBe(first);
  });

  it('ignores fixes that arrive after cancel', async () => {
    const { result } = await startWatching();
    const onLocation = watchPosition.mock.lastCall?.[1];

    act(() => result.current.cancel());
    expect(result.current.status).toBe('idle');
    expect(remove).toHaveBeenCalledTimes(1);

    act(() => {
      onLocation?.(fix(4));
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.location).toBeUndefined();
  });

  it('keeps fixes from a cancelled capture out of the next one', async () => {
    let started: (subscription: Location.LocationSubscription) => void = () => undefined;
    const oldRemove = jest.fn();
    watchPosition.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          started = resolve;
        }),
    );
    const { result } = await startWatching();
    const oldOnLocation = watchPosition.mock.lastCall?.[1];
    act(() => result.current.cancel());

    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('searching'));
    expect(watchPosition).toHaveBeenCalledTimes(2);

    act(() => {
      oldOnLocation?.(fix(3));
    });
    expect(result.current.status).toBe('searching');

    // The old watch only finishes starting now, so it gets stopped straight away.
    await act(async () => started({ remove: oldRemove }));
    expect(oldRemove).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("doesn't start watching if cancelled while asking for permission", async () => {
    let answer: (value: Location.LocationPermissionResponse) => void = () => undefined;
    getPermission.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result } = renderHook(() => useGpsCapture());
    act(() => result.current.start());
    act(() => result.current.cancel());

    await act(async () => answer(granted));
    expect(servicesEnabled).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('stops the watch if a good fix comes before watching has finished starting', async () => {
    let started: (subscription: Location.LocationSubscription) => void = () => undefined;
    watchPosition.mockImplementation((_options, onLocation) => {
      onLocation(fix(3));
      return new Promise((resolve) => {
        started = resolve;
      });
    });
    const { result } = renderHook(() => useGpsCapture());
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.location?.accuracyM).toBe(3);
    expect(remove).not.toHaveBeenCalled();

    await act(async () => started({ remove }));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('shows an error when watching fails to start', async () => {
    watchPosition.mockRejectedValue(new Error('Location request failed'));
    const { result } = renderHook(() => useGpsCapture());
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('shows an error when the phone reports one while watching', async () => {
    const { result } = await startWatching();
    const onError = watchPosition.mock.lastCall?.[2];

    act(() => onError?.('Location services are disabled'));
    expect(result.current.status).toBe('error');
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stops watching when the screen goes away', async () => {
    const { unmount } = await startWatching();
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('forgets the location on clear', async () => {
    const { result } = await startWatching();
    sendFix(fix(4));
    act(() => result.current.clear());
    expect(result.current.status).toBe('idle');
    expect(result.current.location).toBeUndefined();
  });
});

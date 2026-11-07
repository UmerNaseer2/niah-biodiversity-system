import {
  REQUEST_TIME_LIMIT_MS,
  UPLOAD_TIME_LIMIT_MS,
  timeLimitFor,
  withTimeLimit,
} from '@/lib/time-limit';

// A fetch whose server never answers. It only gives up when its signal is used.
function neverAnswers() {
  const signals: AbortSignal[] = [];
  const baseFetch = jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signals.push(signal);
          if (signal.aborted) {
            reject(new Error('Stopped.'));
          }
          signal.addEventListener('abort', () => reject(new Error('Stopped.')));
        }
      }),
  );
  return { baseFetch: baseFetch as unknown as typeof fetch, signals };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('timeLimitFor', () => {
  it('gives half a minute to a request that sends text or nothing', () => {
    expect(REQUEST_TIME_LIMIT_MS).toBe(30_000);
    expect(timeLimitFor()).toBe(REQUEST_TIME_LIMIT_MS);
    expect(timeLimitFor({ method: 'GET' })).toBe(REQUEST_TIME_LIMIT_MS);
    expect(timeLimitFor({ method: 'POST', body: '{"id":"made-up"}' })).toBe(REQUEST_TIME_LIMIT_MS);
  });

  it('gives a minute to a photo upload, which sends bytes', () => {
    expect(UPLOAD_TIME_LIMIT_MS).toBe(60_000);
    expect(timeLimitFor({ method: 'POST', body: new ArrayBuffer(8) })).toBe(UPLOAD_TIME_LIMIT_MS);
  });
});

describe('withTimeLimit', () => {
  it('passes a quick answer straight through', async () => {
    const answer = { ok: true, status: 200 } as Response;
    const baseFetch = jest.fn(async () => answer);
    const limited = withTimeLimit(baseFetch as unknown as typeof fetch);

    await expect(limited('http://127.0.0.1:1/rest/v1/species_public')).resolves.toBe(answer);
    const [input, init] = baseFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(input).toBe('http://127.0.0.1:1/rest/v1/species_public');
    expect(init.signal?.aborted).toBe(false);
    // The timer still runs out later, but stopping a finished request changes nothing.
    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS);
    expect(init.signal?.aborted).toBe(true);
  });

  it('keeps the rest of the request as it was', async () => {
    const baseFetch = jest.fn(async () => ({ ok: true, status: 201 }) as Response);
    const limited = withTimeLimit(baseFetch as unknown as typeof fetch);
    const headers = { apikey: 'made-up' };

    await limited('http://127.0.0.1:1/rest/v1/records', {
      method: 'POST',
      headers,
      body: '{"id":"made-up"}',
    });
    expect(baseFetch.mock.calls[0]).toEqual([
      'http://127.0.0.1:1/rest/v1/records',
      expect.objectContaining({ method: 'POST', headers, body: '{"id":"made-up"}' }),
    ]);
  });

  it('stops a request with no answer after half a minute, as an AbortError', async () => {
    const { baseFetch, signals } = neverAnswers();
    const request = withTimeLimit(baseFetch)('http://127.0.0.1:1/rest/v1/species_public');
    const failure = expect(request).rejects.toMatchObject({
      name: 'AbortError',
      message: 'The request took too long, so it was stopped.',
    });

    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS - 1);
    expect(signals[0].aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await failure;
    expect(signals[0].aborted).toBe(true);
  });

  it('gives a photo upload a minute before stopping it', async () => {
    const { baseFetch, signals } = neverAnswers();
    const request = withTimeLimit(baseFetch)('http://127.0.0.1:1/storage/v1/object/made-up.jpg', {
      method: 'POST',
      body: new ArrayBuffer(8),
    });
    const failure = expect(request).rejects.toMatchObject({ name: 'AbortError' });

    await jest.advanceTimersByTimeAsync(REQUEST_TIME_LIMIT_MS);
    expect(signals[0].aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(UPLOAD_TIME_LIMIT_MS - REQUEST_TIME_LIMIT_MS);
    await failure;
    expect(signals[0].aborted).toBe(true);
  });

  it('passes any other failure through as it was', async () => {
    const noSignal = new TypeError('Network request failed');
    const limited = withTimeLimit(
      jest.fn(async () => {
        throw noSignal;
      }) as unknown as typeof fetch,
    );

    await expect(limited('http://127.0.0.1:1/rest/v1/species_public')).rejects.toBe(noSignal);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('can still be stopped by a signal the request came with', async () => {
    const { baseFetch, signals } = neverAnswers();
    const outside = new AbortController();
    const request = withTimeLimit(baseFetch)('http://127.0.0.1:1/rest/v1/species_public', {
      signal: outside.signal,
    });
    const failure = expect(request).rejects.toThrow('Stopped.');

    outside.abort();
    await failure;
    expect(signals[0].aborted).toBe(true);
  });

  it('stops a request at once if its own signal was already used', async () => {
    const { baseFetch, signals } = neverAnswers();
    const outside = new AbortController();
    outside.abort();

    const request = withTimeLimit(baseFetch)('http://127.0.0.1:1/rest/v1/species_public', {
      signal: outside.signal,
    });
    await expect(request).rejects.toThrow('Stopped.');
    expect(signals[0].aborted).toBe(true);
  });
});

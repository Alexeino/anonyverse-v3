import { restReportService } from '../restReportService';

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = jest.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const PARAMS = { accessToken: 'access-token', reportedUserSid: 'partner-1', reportType: 'harassment' } as const;

describe('restReportService.reportUser', () => {
  it('posts the report with the access token as a Bearer header and returns its id', async () => {
    const fetchMock = mockFetchOnce({ report_id: 'report-1', report_type: 'harassment' });

    const outcome = await restReportService.reportUser(PARAMS);

    expect(outcome).toEqual({ status: 'reported', reportId: 'report-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/report\/report-user$/);
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
    expect(JSON.parse(init!.body as string)).toEqual({
      reported_user_sid: 'partner-1',
      report_type: 'harassment',
    });
  });

  it('sends a trimmed description, and omits a blank one', async () => {
    const fetchMock = mockFetchOnce({ report_id: 'r', report_type: 'other' });
    await restReportService.reportUser({ ...PARAMS, reportType: 'other', description: '  spam links  ' });
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).description).toBe('spam links');

    const blankFetch = mockFetchOnce({ report_id: 'r', report_type: 'other' });
    await restReportService.reportUser({ ...PARAMS, reportType: 'other', description: '   ' });
    expect(JSON.parse(blankFetch.mock.calls[0][1]!.body as string)).not.toHaveProperty('description');
  });

  it('omits report_type for a one-tap report', async () => {
    const fetchMock = mockFetchOnce({ report_id: 'r', report_type: null });

    const outcome = await restReportService.reportUser({ accessToken: 'access-token', reportedUserSid: 'partner-1' });

    expect(outcome).toEqual({ status: 'reported', reportId: 'r' });
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      reported_user_sid: 'partner-1',
    });
  });

  it.each([
    [401, { status: 'unauthorized' }],
    [403, { status: 'failed', retryable: false }],
    [404, { status: 'nothing_to_report' }],
    [422, { status: 'failed', retryable: false }],
    [500, { status: 'failed', retryable: true }],
  ] as const)('maps HTTP %i to %o', async (status, expected) => {
    mockFetchOnce({ detail: 'x' }, status);

    const outcome = await restReportService.reportUser(PARAMS);

    expect(outcome).toMatchObject(expected);
  });

  it('treats a network failure as a retryable failure', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('Network request failed'))) as unknown as typeof fetch;

    const outcome = await restReportService.reportUser(PARAMS);

    expect(outcome).toMatchObject({ status: 'failed', retryable: true });
  });

  it('aborts a request that takes longer than 5s and treats it as a retryable failure', async () => {
    jest.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      globalThis.fetch = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          }),
      ) as unknown as typeof fetch;

      const pending = restReportService.reportUser(PARAMS);
      jest.advanceTimersByTime(4_999);
      expect(signal?.aborted).toBe(false);
      jest.advanceTimersByTime(1);

      const outcome = await pending;
      expect(signal?.aborted).toBe(true);
      expect(outcome).toMatchObject({ status: 'failed', retryable: true });
      expect((outcome as { error: Error }).error.message).toMatch(/timed out after 5000ms/);
    } finally {
      jest.useRealTimers();
    }
  });
});

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

const PARAMS = { accessToken: 'access-token', reportType: 'harassment', reportingUserSid: 'sid-1' } as const;

describe('restReportService.reportUser', () => {
  it('posts the report and returns its id', async () => {
    const fetchMock = mockFetchOnce({ report_id: 'report-1', report_type: 'harassment' });

    const outcome = await restReportService.reportUser(PARAMS);

    expect(outcome).toEqual({ status: 'reported', reportId: 'report-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/report\/report-user$/);
    expect(JSON.parse(init!.body as string)).toEqual({
      token: 'access-token',
      report_type: 'harassment',
      reporting_user_sid: 'sid-1',
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

  it.each([
    [401, { status: 'unauthorized' }],
    [403, { status: 'sid_rejected' }],
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
});

import { Platform } from 'react-native';
import { restFeedbackService } from '../restFeedbackService';
import type { FeedbackSubmission } from '../types';

const SUBMISSION: FeedbackSubmission = {
  type: 'BUG',
  message: 'The chat screen freezes.',
  rating: 2,
  screen: 'ChatScreen',
};

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = jest.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('restFeedbackService.submit', () => {
  it('posts the submission with a bearer token and returns the new id', async () => {
    const fetchMock = mockFetchOnce({ id: 7, status: 'NEW', created_at: '2026-09-26T00:00:00Z' }, 201);

    const outcome = await restFeedbackService.submit(SUBMISSION, 'access-token');

    expect(outcome).toEqual({ status: 'submitted', id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/feedback$/);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer access-token',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      type: 'BUG',
      message: 'The chat screen freezes.',
      rating: 2,
      screen: 'ChatScreen',
      os_version: String(Platform.Version),
    });
  });

  it('never sends a device_id — the backend takes it from the token', async () => {
    const fetchMock = mockFetchOnce({ id: 1, status: 'NEW', created_at: '' }, 201);

    await restFeedbackService.submit(SUBMISSION, 'access-token');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('device_id');
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'blocked'],
    [422, 'invalid'],
    [429, 'rate_limited'],
  ])('maps HTTP %i to %s', async (status, expected) => {
    mockFetchOnce({ detail: 'x' }, status);

    const outcome = await restFeedbackService.submit(SUBMISSION, 'access-token');

    expect(outcome).toEqual({ status: expected });
  });

  it('returns failed for other HTTP errors', async () => {
    mockFetchOnce({ detail: 'boom' }, 500);

    const outcome = await restFeedbackService.submit(SUBMISSION, 'access-token');

    expect(outcome.status).toBe('failed');
  });

  it('returns failed when the network request throws', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;

    const outcome = await restFeedbackService.submit(SUBMISSION, 'access-token');

    expect(outcome.status).toBe('failed');
  });
});

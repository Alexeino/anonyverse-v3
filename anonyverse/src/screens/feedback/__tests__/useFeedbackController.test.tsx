import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { usePostHog } from 'posthog-react-native';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { FeedbackOutcome } from '../../../services/feedback/types';
import { makeFakeTokenProvider } from '../../../services/chatSocket/testing/fakeChatSocketService';
import type { TokenProvider } from '../../../services/session/tokenProvider';
import {
  type FeedbackDefaults,
  useFeedbackController,
} from '../useFeedbackController';

const mockPostHogClient = jest.mocked(usePostHog)();

function makeFeedbackService(outcome: FeedbackOutcome = { status: 'submitted', id: 1 }) {
  const submit = jest.fn(() => Promise.resolve(outcome));
  const service: FeedbackService = { submit };
  return { service, submit };
}

function Harness({
  defaults,
  tokenProvider,
  feedbackService,
  onReady,
}: {
  defaults: FeedbackDefaults;
  tokenProvider: TokenProvider;
  feedbackService: FeedbackService;
  onReady: (result: ReturnType<typeof useFeedbackController>) => void;
}) {
  const result = useFeedbackController(defaults, tokenProvider, feedbackService);
  onReady(result);
  return null;
}

async function render(
  tokenProvider: TokenProvider,
  feedbackService: FeedbackService,
  defaults: FeedbackDefaults = {},
) {
  let latest: ReturnType<typeof useFeedbackController> | undefined;

  await act(async () => {
    ReactTestRenderer.create(
      <Harness
        defaults={defaults}
        tokenProvider={tokenProvider}
        feedbackService={feedbackService}
        onReady={result => {
          latest = result;
        }}
      />,
    );
  });

  return {
    get latest() {
      return latest!;
    },
  };
}

describe('useFeedbackController', () => {
  it('starts as GENERAL with an empty message and cannot submit', async () => {
    const { service } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service);

    expect(rendered.latest.type).toBe('GENERAL');
    expect(rendered.latest.phase).toBe('editing');
    expect(rendered.latest.canSubmit).toBe(false);
  });

  it('uses the pre-filled type from defaults', async () => {
    const { service } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service, {
      type: 'BUG',
      screen: 'ChatScreen',
    });

    expect(rendered.latest.type).toBe('BUG');
  });

  it('does not allow a whitespace-only message', async () => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service);

    await act(async () => rendered.latest.setMessage('    '));
    expect(rendered.latest.canSubmit).toBe(false);

    await act(async () => rendered.latest.submit());
    expect(submit).not.toHaveBeenCalled();
  });

  it('blocks messages over 2000 characters and allows exactly 2000', async () => {
    const { service } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service);

    await act(async () => rendered.latest.setMessage('x'.repeat(2001)));
    expect(rendered.latest.isMessageTooLong).toBe(true);
    expect(rendered.latest.canSubmit).toBe(false);

    await act(async () => rendered.latest.setMessage('x'.repeat(2000)));
    expect(rendered.latest.isMessageTooLong).toBe(false);
    expect(rendered.latest.canSubmit).toBe(true);
  });

  it('toggles the optional rating off when the same value is tapped again', async () => {
    const { service } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service);

    await act(async () => rendered.latest.toggleRating(4));
    expect(rendered.latest.rating).toBe(4);

    await act(async () => rendered.latest.toggleRating(4));
    expect(rendered.latest.rating).toBeNull();
  });

  it('submits the trimmed message with the token and moves to submitted', async () => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service, { screen: 'ChatListScreen' });

    await act(async () => {
      rendered.latest.setType('FEATURE_REQUEST');
      rendered.latest.setMessage('  Add dark mode  ');
      rendered.latest.toggleRating(5);
    });
    await act(async () => rendered.latest.submit());

    expect(submit).toHaveBeenCalledWith(
      { type: 'FEATURE_REQUEST', message: 'Add dark mode', rating: 5, screen: 'ChatListScreen' },
      'access-token',
    );
    expect(rendered.latest.phase).toBe('submitted');
    expect(rendered.latest.error).toBeNull();
  });

  it('captures analytics without the message text', async () => {
    const { service } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service, { screen: 'ChatListScreen' });

    await act(async () => rendered.latest.setMessage('private details'));
    await act(async () => rendered.latest.submit());

    expect(mockPostHogClient.capture).toHaveBeenCalledWith('feedback_submitted', {
      type: 'GENERAL',
      has_rating: false,
      screen: 'ChatListScreen',
    });
    expect(JSON.stringify(jest.mocked(mockPostHogClient.capture).mock.calls)).not.toContain('private details');
  });

  it('forces a token refresh and retries once when the backend answers 401', async () => {
    const submit = jest
      .fn<Promise<FeedbackOutcome>, [unknown, string]>()
      .mockResolvedValueOnce({ status: 'unauthorized' })
      .mockResolvedValueOnce({ status: 'submitted', id: 1 });
    const { tokenProvider, getFreshAccessToken } = makeFakeTokenProvider([
      { status: 'ok', accessToken: 'stale-token' },
      { status: 'ok', accessToken: 'refreshed-token' },
    ]);
    const rendered = await render(tokenProvider, { submit });

    await act(async () => rendered.latest.setMessage('hello'));
    await act(async () => rendered.latest.submit());

    expect(getFreshAccessToken).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0][1]).toBe('stale-token');
    expect(submit.mock.calls[1][1]).toBe('refreshed-token');
    expect(rendered.latest.phase).toBe('submitted');
  });

  it('shows the restart error when the forced refresh after a 401 needs re-auth', async () => {
    const { service, submit } = makeFeedbackService({ status: 'unauthorized' });
    const { tokenProvider } = makeFakeTokenProvider([
      { status: 'ok', accessToken: 'access-token' },
      { status: 'reauth_required' },
    ]);
    const rendered = await render(tokenProvider, service);

    await act(async () => rendered.latest.setMessage('hello'));
    await act(async () => rendered.latest.submit());

    expect(submit).toHaveBeenCalledTimes(1);
    expect(rendered.latest.error).toBe('unauthorized');
    expect(rendered.latest.phase).toBe('editing');
  });

  it('shows the connection error without calling the backend when the token refresh fails', async () => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider({ status: 'failed' }).tokenProvider, service);

    await act(async () => rendered.latest.setMessage('hello'));
    await act(async () => rendered.latest.submit());

    expect(submit).not.toHaveBeenCalled();
    expect(rendered.latest.error).toBe('failed');
    expect(rendered.latest.phase).toBe('editing');
  });

  it('shows the restart error without calling the backend when there is no token', async () => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider({ status: 'reauth_required' }).tokenProvider, service);

    await act(async () => rendered.latest.setMessage('hello'));
    await act(async () => rendered.latest.submit());

    expect(submit).not.toHaveBeenCalled();
    expect(rendered.latest.error).toBe('unauthorized');
    expect(rendered.latest.phase).toBe('editing');
  });

  it.each(['unauthorized', 'blocked', 'rate_limited', 'invalid'] as const)(
    'keeps the message and shows the %s error when the backend rejects it',
    async status => {
      const { service } = makeFeedbackService({ status });
      const rendered = await render(makeFakeTokenProvider().tokenProvider, service);

      await act(async () => rendered.latest.setMessage('hello'));
      await act(async () => rendered.latest.submit());

      expect(rendered.latest.error).toBe(status);
      expect(rendered.latest.phase).toBe('editing');
      expect(rendered.latest.message).toBe('hello');
      expect(rendered.latest.canSubmit).toBe(true);
      expect(mockPostHogClient.capture).not.toHaveBeenCalled();
    },
  );

  it('ignores a second submit while the first is in flight', async () => {
    let resolveSubmit!: (outcome: FeedbackOutcome) => void;
    const submit = jest.fn(
      () => new Promise<FeedbackOutcome>(resolve => { resolveSubmit = resolve; }),
    );
    const rendered = await render(makeFakeTokenProvider().tokenProvider, { submit });

    await act(async () => rendered.latest.setMessage('hello'));
    let first!: Promise<void>;
    await act(async () => {
      first = rendered.latest.submit();
      rendered.latest.submit();
    });
    expect(rendered.latest.phase).toBe('submitting');

    await act(async () => {
      resolveSubmit({ status: 'submitted', id: 1 });
      await first;
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(rendered.latest.phase).toBe('submitted');
  });
});

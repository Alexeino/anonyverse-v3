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


async function answerBug(rendered: Awaited<ReturnType<typeof render>>) {
  await act(async () => rendered.latest.answerSomethingWrong(true));
  await act(async () => rendered.latest.toggleReason('BUG_APP_FROZE'));
}

describe('useFeedbackController', () => {
  it('starts on the question with nothing to send', async () => {
    const rendered = await render(makeFakeTokenProvider().tokenProvider, makeFeedbackService().service);

    expect(rendered.latest.step).toBe('question');
    expect(rendered.latest.canSubmit).toBe(false);
  });

  it('opens straight on the bug options when defaults.type is BUG', async () => {
    const rendered = await render(makeFakeTokenProvider().tokenProvider, makeFeedbackService().service, {
      type: 'BUG',
      screen: 'ChatScreen',
    });

    expect(rendered.latest.step).toBe('bug');
    expect(rendered.latest.reasonOptions).toContain('BUG_MESSAGES_NOT_SENT');
  });

  it('shows the bug options for the screen it was opened from', async () => {
    const chat = await render(makeFakeTokenProvider().tokenProvider, makeFeedbackService().service, {
      screen: 'ChatScreen',
    });
    const other = await render(makeFakeTokenProvider().tokenProvider, makeFeedbackService().service, {
      screen: 'ChatListScreen',
    });

    await act(async () => chat.latest.answerSomethingWrong(true));
    await act(async () => other.latest.answerSomethingWrong(true));

    expect(chat.latest.reasonOptions).toContain('BUG_TYPING_INDICATOR');
    expect(other.latest.reasonOptions).not.toContain('BUG_TYPING_INDICATOR');
  });

  it('sends a tap-only bug report with a null message, the screen and the trigger', async () => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service, {
      screen: 'ChatScreen',
      trigger: 'CHAT_EXIT',
    });

    await answerBug(rendered);
    await act(async () => rendered.latest.toggleReason('BUG_DISCONNECTED'));
    expect(rendered.latest.canSubmit).toBe(true);
    await act(async () => rendered.latest.submit());

    expect(submit).toHaveBeenCalledWith(
      {
        type: 'BUG',
        message: null,
        reasons: ['BUG_APP_FROZE', 'BUG_DISCONNECTED'],
        trigger: 'CHAT_EXIT',
        rating: null,
        screen: 'ChatScreen',
      },
      'access-token',
    );
    expect(rendered.latest.step).toBe('submitted');
  });

  it('lets a bug report be sent with only a typed message', async () => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service);

    await act(async () => rendered.latest.answerSomethingWrong(true));
    expect(rendered.latest.canSubmit).toBe(false);
    await act(async () => rendered.latest.setMessage('  It crashed  '));
    await act(async () => rendered.latest.submit());

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ message: 'It crashed', reasons: [] }), 'access-token');
  });

  it('toggles a reason off when tapped again', async () => {
    const rendered = await render(makeFakeTokenProvider().tokenProvider, makeFeedbackService().service);

    await answerBug(rendered);
    await act(async () => rendered.latest.toggleReason('BUG_APP_FROZE'));

    expect(rendered.latest.reasons).toEqual([]);
  });

  it.each([
    [1, 'What went wrong?', 'IMPROVEMENT', 'DISLIKE_TOO_BUGGY'],
    [2, 'What could be better?', 'IMPROVEMENT', 'IMPROVE_SPEED'],
    [3, 'What could be better?', 'IMPROVEMENT', 'IMPROVE_SPEED'],
    [4, 'What would make it a 5?', 'FEATURE_REQUEST', 'WISH_VOICE_CHAT'],
    [5, 'What do you love most?', 'GENERAL', 'LOVE_ANONYMITY'],
  ] as const)('a %i-star rating asks "%s" and is sent as %s', async (stars, question, type, reason) => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service);

    await act(async () => rendered.latest.answerSomethingWrong(false));
    expect(rendered.latest.canSubmit).toBe(false);
    await act(async () => rendered.latest.setRating(stars));
    expect(rendered.latest.followUpQuestion).toBe(question);
    expect(rendered.latest.reasonOptions).toContain(reason);
    await act(async () => rendered.latest.toggleReason(reason));
    await act(async () => rendered.latest.submit());

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ type, rating: stars, reasons: [reason], trigger: 'MANUAL' }),
      'access-token',
    );
  });

  it('lets a rating be sent without picking a follow-up option', async () => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider().tokenProvider, service);

    await act(async () => rendered.latest.answerSomethingWrong(false));
    await act(async () => rendered.latest.setRating(5));
    await act(async () => rendered.latest.submit());

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, reasons: [] }), 'access-token');
  });

  it('clears picked options when the rating moves to a band with a different question', async () => {
    const rendered = await render(makeFakeTokenProvider().tokenProvider, makeFeedbackService().service);

    await act(async () => rendered.latest.answerSomethingWrong(false));
    await act(async () => rendered.latest.setRating(2));
    await act(async () => rendered.latest.toggleReason('IMPROVE_SPEED'));
    await act(async () => rendered.latest.setRating(3));
    expect(rendered.latest.reasons).toEqual(['IMPROVE_SPEED']);

    await act(async () => rendered.latest.setRating(5));
    expect(rendered.latest.reasons).toEqual([]);
  });

  it('blocks a message over 2000 characters', async () => {
    const rendered = await render(makeFakeTokenProvider().tokenProvider, makeFeedbackService().service);

    await answerBug(rendered);
    await act(async () => rendered.latest.setMessage('x'.repeat(2001)));
    expect(rendered.latest.canSubmit).toBe(false);
    await act(async () => rendered.latest.setMessage('x'.repeat(2000)));
    expect(rendered.latest.canSubmit).toBe(true);
  });

  it('captures analytics with reason codes but never the message text', async () => {
    const rendered = await render(makeFakeTokenProvider().tokenProvider, makeFeedbackService().service, {
      screen: 'ChatListScreen',
    });

    await answerBug(rendered);
    await act(async () => rendered.latest.setMessage('private details'));
    await act(async () => rendered.latest.submit());

    expect(mockPostHogClient.capture).toHaveBeenCalledWith('feedback_submitted', {
      type: 'BUG',
      trigger: 'MANUAL',
      reasons: ['BUG_APP_FROZE'],
      has_rating: false,
      has_message: true,
      screen: 'ChatListScreen',
    });
    expect(JSON.stringify(jest.mocked(mockPostHogClient.capture).mock.calls)).not.toContain('private details');
  });

  it.each(['blocked', 'rate_limited', 'invalid'] as const)(
    'keeps the answers and shows the %s error when the backend rejects it',
    async status => {
      const rendered = await render(makeFakeTokenProvider().tokenProvider, makeFeedbackService({ status }).service);

      await answerBug(rendered);
      await act(async () => rendered.latest.submit());

      expect(rendered.latest.error).toBe(status);
      expect(rendered.latest.step).toBe('bug');
      expect(rendered.latest.reasons).toEqual(['BUG_APP_FROZE']);
      expect(rendered.latest.canSubmit).toBe(true);
      expect(mockPostHogClient.capture).not.toHaveBeenCalled();
    },
  );

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

    await answerBug(rendered);
    await act(async () => rendered.latest.submit());

    expect(getFreshAccessToken).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(submit.mock.calls.map(call => call[1])).toEqual(['stale-token', 'refreshed-token']);
    expect(rendered.latest.step).toBe('submitted');
  });

  it('shows the restart error when the session is gone', async () => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider({ status: 'reauth_required' }).tokenProvider, service);

    await answerBug(rendered);
    await act(async () => rendered.latest.submit());

    expect(submit).not.toHaveBeenCalled();
    expect(rendered.latest.error).toBe('unauthorized');
  });

  it('shows the connection error when the token refresh fails', async () => {
    const { service, submit } = makeFeedbackService();
    const rendered = await render(makeFakeTokenProvider({ status: 'failed' }).tokenProvider, service);

    await answerBug(rendered);
    await act(async () => rendered.latest.submit());

    expect(submit).not.toHaveBeenCalled();
    expect(rendered.latest.error).toBe('failed');
  });

  it('ignores a second submit while the first is in flight', async () => {
    let resolveSubmit!: (outcome: FeedbackOutcome) => void;
    const submit = jest.fn(
      () => new Promise<FeedbackOutcome>(resolve => { resolveSubmit = resolve; }),
    );
    const rendered = await render(makeFakeTokenProvider().tokenProvider, { submit });

    await answerBug(rendered);
    let first!: Promise<void>;
    await act(async () => {
      first = rendered.latest.submit();
      rendered.latest.submit();
    });
    expect(rendered.latest.submitting).toBe(true);

    await act(async () => {
      resolveSubmit({ status: 'submitted', id: 1 });
      await first;
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(rendered.latest.step).toBe('submitted');
  });
});

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { usePostHog } from 'posthog-react-native';
import type { ChatSocketService } from '../../../services/chatSocket/ChatSocketService';
import type { ChatSocketConnectError } from '../../../services/chatSocket/types';
import {
  makeFakeChatSocketService,
  makeFakeTokenProvider,
} from '../../../services/chatSocket/testing/fakeChatSocketService';
import type { TokenProvider } from '../../../services/session/tokenProvider';
import type { TopicsSelection } from '../../topics/TopicsScreen';
import { useFindingMatchController } from '../useFindingMatchController';

const SELECTION: TopicsSelection = { mood: 'good', tags: ['life', 'work'], optedIn: true };

const mockPostHogClient = jest.mocked(usePostHog)();

// Every harness still mounted at the end of a test is unmounted, so no
// findMatch loop keeps real timers alive past it.
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

/** Captures the app-state listener registered by useAppForeground. */
function captureAppStateListener() {
  const addEventListener = jest.mocked(AppState.addEventListener);
  const originalImpl = addEventListener.getMockImplementation();
  const captured: { listener?: (state: AppStateStatus) => void } = {};
  addEventListener.mockImplementation((_type, listener) => {
    captured.listener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
  return {
    emit: (state: AppStateStatus) => captured.listener?.(state),
    restore: () => addEventListener.mockImplementation(originalImpl),
  };
}

function Harness({
  selection,
  tokenProvider,
  createChatSocketService,
  onClose,
  onMatched,
  onReauthRequired,
  onReady,
}: {
  selection: TopicsSelection;
  tokenProvider: TokenProvider;
  createChatSocketService: () => ChatSocketService;
  onClose: () => void;
  onMatched: (service: ChatSocketService, partner: string) => void;
  onReauthRequired: () => void;
  onReady: (result: ReturnType<typeof useFindingMatchController>) => void;
}) {
  const result = useFindingMatchController(
    selection,
    tokenProvider,
    createChatSocketService,
    onClose,
    onMatched,
    onReauthRequired,
  );
  onReady(result);
  return null;
}

interface RenderedController {
  onClose: jest.Mock;
  onMatched: jest.Mock;
  onReauthRequired: jest.Mock;
  renderer: ReactTestRenderer.ReactTestRenderer;
  readonly latest: ReturnType<typeof useFindingMatchController>;
}

async function render(
  tokenProvider: TokenProvider,
  createChatSocketService: () => ChatSocketService,
  selection: TopicsSelection = SELECTION,
): Promise<RenderedController> {
  const onClose = jest.fn();
  const onMatched = jest.fn();
  const onReauthRequired = jest.fn();
  let latest: ReturnType<typeof useFindingMatchController> | undefined;
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness
        selection={selection}
        tokenProvider={tokenProvider}
        createChatSocketService={createChatSocketService}
        onClose={onClose}
        onMatched={onMatched}
        onReauthRequired={onReauthRequired}
        onReady={result => {
          latest = result;
        }}
      />,
    );
    await flushMicrotasks();
  });
  mountedRenderers.push(renderer);

  return {
    onClose,
    onMatched,
    onReauthRequired,
    renderer,
    get latest() {
      return latest!;
    },
  };
}

async function flushMicrotasks(times = 20) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

/** Advances fake timers and lets the findMatch loop's awaits settle in between. */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await flushMicrotasks();
  });
}

describe('useFindingMatchController', () => {
  afterEach(() => {
    act(() => {
      mountedRenderers.splice(0).forEach(renderer => renderer.unmount());
    });
    jest.useRealTimers();
  });

  it('no usable session: asks for reauth without attempting to connect', async () => {
    const fake = makeFakeChatSocketService();
    const { tokenProvider } = makeFakeTokenProvider({ status: 'reauth_required' });

    const harness = await render(tokenProvider, () => fake.service);

    expect(harness.onReauthRequired).toHaveBeenCalledTimes(1);
    expect(fake.connect).not.toHaveBeenCalled();
    expect(mockPostHogClient.capture).toHaveBeenCalledWith('match_search_started', { topics: ['life', 'work'] });
  });

  it('happy path: connects, joins the queue, and stays searching until match_found', async () => {
    const fake = makeFakeChatSocketService();
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    expect(fake.connect).toHaveBeenCalledWith(tokenProvider.peekAccessToken);
    // The service maps mood for the server (toBackendMood); the controller passes it through.
    expect(fake.joinChat).toHaveBeenCalledWith(['life', 'work'], 'good', true);
    expect(harness.latest.phase).toBe('searching');

    await act(async () => {
      fake.emitMatchFound({ partner: 'partner-id' });
      await flushMicrotasks();
    });

    expect(harness.latest.phase).toBe('matched');
    expect(mockPostHogClient.capture).toHaveBeenCalledWith(
      'match_found',
      expect.objectContaining({ topics: ['life', 'work'], wait_duration_ms: expect.any(Number) }),
    );

    act(() => {
      harness.renderer.unmount();
    });
  });

  it('match_found: hands off the live socket via onMatched after the display delay, and unmount does not disconnect it', async () => {
    jest.useFakeTimers();
    const fake = makeFakeChatSocketService();
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    await act(async () => {
      fake.emitMatchFound({ partner: 'partner-id' });
      await flushMicrotasks();
    });
    expect(harness.onMatched).not.toHaveBeenCalled();

    await advance(1200);

    expect(harness.onMatched).toHaveBeenCalledTimes(1);
    expect(harness.onMatched).toHaveBeenCalledWith(fake.service, 'partner-id');

    act(() => {
      harness.renderer.unmount();
    });

    // The handed-off socket now belongs to the Chat screen — unmounting
    // Finding Match after handoff must not tear it down out from under it.
    expect(fake.disconnect).not.toHaveBeenCalled();
  });

  it('handleClose during the handoff delay cancels the handoff even before the screen unmounts', async () => {
    jest.useFakeTimers();
    const fake = makeFakeChatSocketService();
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    await act(async () => {
      fake.emitMatchFound({ partner: 'partner-id' });
      await flushMicrotasks();
    });
    act(() => {
      harness.latest.handleClose();
    });
    await advance(1200);

    expect(harness.onClose).toHaveBeenCalledTimes(1);
    expect(harness.onMatched).not.toHaveBeenCalled();
  });

  it('partner leaves during the handoff delay: cancels the handoff and rejoins on the same socket', async () => {
    jest.useFakeTimers();
    const fake = makeFakeChatSocketService();
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    await act(async () => {
      fake.emitMatchFound({ partner: 'partner-id' });
      await flushMicrotasks();
    });
    await act(async () => {
      fake.emitChatEnded({ reason: 'disconnected', by: 'partner' });
      await flushMicrotasks();
    });

    expect(harness.latest.phase).toBe('searching');
    expect(fake.joinChat).toHaveBeenCalledTimes(2);
    expect(fake.connect).toHaveBeenCalledTimes(1);

    await advance(1200);
    expect(harness.onMatched).not.toHaveBeenCalled();

    act(() => {
      harness.renderer.unmount();
    });
  });

  it('invalid_token: forces a refresh and reconnects once', async () => {
    const authError: ChatSocketConnectError = { reason: 'AUTH_ERROR' };
    let attempts = 0;
    const fake = makeFakeChatSocketService({
      connectImpl: () => (attempts++ === 0 ? Promise.reject(authError) : Promise.resolve()),
    });
    const { tokenProvider, getFreshAccessToken } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    expect(getFreshAccessToken).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(fake.connect).toHaveBeenCalledTimes(2);
    expect(harness.latest.phase).toBe('searching');
  });

  it('invalid_token even after a refresh: surfaces AUTH_ERROR and does not attempt join_chat', async () => {
    const authError: ChatSocketConnectError = { reason: 'AUTH_ERROR' };
    const fake = makeFakeChatSocketService({ connectImpl: () => Promise.reject(authError) });
    const { tokenProvider } = makeFakeTokenProvider();

    const harness = await render(tokenProvider, () => fake.service);

    expect(harness.latest.phase).toBe('error');
    expect(harness.latest.error).toEqual({ reason: 'AUTH_ERROR' });
    expect(fake.joinChat).not.toHaveBeenCalled();
  });

  it('connect timeout: retries with backoff, then surfaces CONNECTION_TIMEOUT', async () => {
    jest.useFakeTimers();
    const connectError: ChatSocketConnectError = { reason: 'CONNECTION_TIMEOUT' };
    const fake = makeFakeChatSocketService({ connectImpl: () => Promise.reject(connectError) });
    const { tokenProvider } = makeFakeTokenProvider();

    const harness = await render(tokenProvider, () => fake.service);
    expect(harness.latest.phase).toBe('connecting');

    await advance(1_000);
    await advance(2_000);
    await advance(4_000);

    expect(fake.connect).toHaveBeenCalledTimes(4);
    expect(harness.latest.phase).toBe('error');
    expect(harness.latest.error).toEqual({ reason: 'CONNECTION_TIMEOUT' });
  });

  it('join_chat rate limited: waits for the bucket to refill, then joins again', async () => {
    jest.useFakeTimers();
    let joins = 0;
    const fake = makeFakeChatSocketService({
      joinChatImpl: () =>
        Promise.resolve(joins++ === 0 ? { ok: false, status: 'rate_limited' as const } : { ok: true, status: 'queued' as const }),
    });
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    expect(fake.joinChat).toHaveBeenCalledTimes(1);
    await advance(15_000);

    expect(fake.joinChat).toHaveBeenCalledTimes(2);
    expect(harness.latest.phase).toBe('searching');
    act(() => {
      harness.renderer.unmount();
    });
  });

  it('queued: keeps waiting for match_found without sending join_chat again', async () => {
    jest.useFakeTimers();
    const fake = makeFakeChatSocketService();
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    await advance(5 * 60_000);

    // join_chat is rate limited; a 'queued' ack already holds our place.
    expect(fake.joinChat).toHaveBeenCalledTimes(1);
    expect(harness.latest.phase).toBe('searching');
    act(() => {
      harness.renderer.unmount();
    });
  });

  it('connection lost while queued: reconnects on a fresh socket and joins again', async () => {
    jest.useFakeTimers();
    const fake = makeFakeChatSocketService();
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    await act(async () => {
      fake.emitConnectionLost();
      await flushMicrotasks();
    });
    // The reconnect backs off first, like any other drop.
    await advance(1_000);

    expect(fake.connect).toHaveBeenCalledTimes(2);
    expect(fake.joinChat).toHaveBeenCalledTimes(2);
    expect(harness.latest.phase).toBe('searching');
    act(() => {
      harness.renderer.unmount();
    });
  });

  it('no join_chat ack: reconnects on a fresh socket and joins again', async () => {
    jest.useFakeTimers();
    let joins = 0;
    const fake = makeFakeChatSocketService({
      joinChatImpl: () =>
        joins++ === 0 ? Promise.reject({ reason: 'JOIN_TIMEOUT' }) : Promise.resolve({ ok: true, status: 'queued' as const }),
    });
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    await advance(1_000);

    expect(fake.connect).toHaveBeenCalledTimes(2);
    expect(fake.joinChat).toHaveBeenCalledTimes(2);
    act(() => {
      harness.renderer.unmount();
    });
  });

  it('returning from the background restarts the search on a new socket', async () => {
    const appState = captureAppStateListener();
    try {
      const first = makeFakeChatSocketService();
      const second = makeFakeChatSocketService();
      const services = [first.service, second.service];
      const { tokenProvider } = makeFakeTokenProvider();
      const harness = await render(tokenProvider, () => services.shift()!);

      await act(async () => {
        appState.emit('background');
        appState.emit('active');
        await flushMicrotasks();
      });

      expect(first.disconnect).toHaveBeenCalled();
      expect(second.connect).toHaveBeenCalledTimes(1);
      expect(second.joinChat).toHaveBeenCalledTimes(1);
      expect(harness.latest.phase).toBe('searching');
    } finally {
      appState.restore();
    }
  });

  it('handleClose cancels the search with end_chat, disconnects, and calls onClose', async () => {
    const fake = makeFakeChatSocketService();
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    act(() => {
      harness.latest.handleClose();
    });

    expect(fake.sendEndChat).toHaveBeenCalledTimes(1);
    expect(fake.disconnect).toHaveBeenCalled();
    expect(harness.onClose).toHaveBeenCalledTimes(1);
  });

  it('unmounting before connect resolves disconnects and does not join afterwards', async () => {
    let resolveConnect: () => void = () => {};
    const fake = makeFakeChatSocketService({
      connectImpl: () => new Promise<void>(resolve => (resolveConnect = resolve)),
    });
    const { tokenProvider } = makeFakeTokenProvider();
    const harness = await render(tokenProvider, () => fake.service);

    expect(harness.latest.phase).toBe('connecting');

    act(() => {
      harness.renderer.unmount();
    });

    expect(fake.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConnect();
      await flushMicrotasks();
    });

    // The real assertion: without the cancellation check, a connect that
    // resolves after unmount would still proceed to call joinChat.
    expect(fake.joinChat).not.toHaveBeenCalled();
  });
});

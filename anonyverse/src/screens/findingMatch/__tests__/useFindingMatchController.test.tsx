import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { usePostHog } from 'posthog-react-native';
import type { ChatSocketService } from '../../../services/chatSocket/ChatSocketService';
import type { ChatSocketConnectError, JoinChatAck, MatchFoundEvent } from '../../../services/chatSocket/types';
import type { AuthToken } from '../../../services/auth/types';
import type { SessionStore } from '../../../services/session/SessionStore';
import type { TopicsSelection } from '../../topics/TopicsScreen';
import { useFindingMatchController } from '../useFindingMatchController';

const TOKEN: AuthToken = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  access_token_expiry: 3600,
  refresh_token_expiry: 2592000,
};

const SELECTION: TopicsSelection = { mood: 'good', tags: ['life', 'work'], optedIn: true };

const mockPostHogClient = jest.mocked(usePostHog)();

function makeSessionStore(token: AuthToken | null): SessionStore {
  return {
    getToken: () => token,
    setToken: jest.fn(),
    clear: jest.fn(),
  };
}

interface FakeServiceOptions {
  connectImpl?: () => Promise<void>;
  joinChatImpl?: () => Promise<JoinChatAck>;
}

function makeChatSocketService({
  connectImpl = () => Promise.resolve(),
  joinChatImpl = () => Promise.resolve({ ok: true, status: 'queued' }),
}: FakeServiceOptions = {}) {
  const matchFoundHandlers = new Set<(event: MatchFoundEvent) => void>();
  const disconnect = jest.fn();
  const connect = jest.fn(connectImpl);
  const joinChat = jest.fn(joinChatImpl);
  const sendMessage = jest.fn();

  const service: ChatSocketService = {
    connect,
    joinChat,
    onMatchFound: handler => {
      matchFoundHandlers.add(handler);
      return () => matchFoundHandlers.delete(handler);
    },
    sendMessage,
    onReceiveMessage: () => () => {},
    disconnect,
  };

  return {
    service,
    connect,
    joinChat,
    disconnect,
    sendMessage,
    emitMatchFound: (event: MatchFoundEvent) => matchFoundHandlers.forEach(handler => handler(event)),
  };
}

function Harness({
  sessionStore,
  createChatSocketService,
  onClose,
  onMatched,
  onReady,
}: {
  sessionStore: SessionStore;
  createChatSocketService: () => ChatSocketService;
  onClose: () => void;
  onMatched: (service: ChatSocketService, partner: string) => void;
  onReady: (result: ReturnType<typeof useFindingMatchController>) => void;
}) {
  const result = useFindingMatchController(SELECTION, sessionStore, createChatSocketService, onClose, onMatched);
  onReady(result);
  return null;
}

interface RenderedController {
  onClose: jest.Mock;
  onMatched: jest.Mock;
  renderer: ReactTestRenderer.ReactTestRenderer;
  readonly latest: ReturnType<typeof useFindingMatchController>;
}

async function render(
  sessionStore: SessionStore,
  createChatSocketService: () => ChatSocketService,
): Promise<RenderedController> {
  const onClose = jest.fn();
  const onMatched = jest.fn();
  let latest: ReturnType<typeof useFindingMatchController> | undefined;
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness
        sessionStore={sessionStore}
        createChatSocketService={createChatSocketService}
        onClose={onClose}
        onMatched={onMatched}
        onReady={result => {
          latest = result;
        }}
      />,
    );
    await flushMicrotasks();
  });

  return {
    onClose,
    onMatched,
    renderer,
    get latest() {
      return latest!;
    },
  };
}

async function flushMicrotasks(times = 10) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

describe('useFindingMatchController', () => {
  it('no access token: goes straight to an error phase without attempting to connect', async () => {
    const fake = makeChatSocketService();
    const createChatSocketService = jest.fn(() => fake.service);

    const harness = await render(makeSessionStore(null), createChatSocketService);

    expect(harness.latest.phase).toBe('error');
    expect(harness.latest.error).toEqual({ reason: 'MISSING_TOKEN' });
    expect(createChatSocketService).not.toHaveBeenCalled();
    expect(mockPostHogClient.capture).toHaveBeenCalledWith('match_search_started', { topics: ['life', 'work'] });
  });

  it('happy path: connects, joins the queue, and stays searching until match_found', async () => {
    const fake = makeChatSocketService();
    const harness = await render(makeSessionStore(TOKEN), () => fake.service);

    expect(fake.connect).toHaveBeenCalledWith('access-token', 'life');
    expect(fake.joinChat).toHaveBeenCalledWith(['life', 'work'], 'good', true);
    expect(harness.latest.phase).toBe('searching');
    expect(mockPostHogClient.capture).toHaveBeenCalledWith('match_search_started', { topics: ['life', 'work'] });

    act(() => {
      fake.emitMatchFound({ partner: 'partner-id' });
    });

    expect(harness.latest.phase).toBe('matched');
    expect(mockPostHogClient.capture).toHaveBeenCalledWith(
      'match_found',
      expect.objectContaining({ topics: ['life', 'work'], wait_duration_ms: expect.any(Number) }),
    );

    // Unmount rather than leaving the pending handoff setTimeout dangling
    // past the end of the test.
    act(() => {
      harness.renderer.unmount();
    });
  });

  it('match_found: hands off the live socket via onMatched after the display delay, and unmount does not disconnect it', async () => {
    jest.useFakeTimers();
    try {
      const fake = makeChatSocketService();
      const harness = await render(makeSessionStore(TOKEN), () => fake.service);

      act(() => {
        fake.emitMatchFound({ partner: 'partner-id' });
      });

      expect(harness.onMatched).not.toHaveBeenCalled();

      act(() => {
        jest.runAllTimers();
      });

      expect(harness.onMatched).toHaveBeenCalledTimes(1);
      expect(harness.onMatched).toHaveBeenCalledWith(fake.service, 'partner-id');
      expect(fake.disconnect).not.toHaveBeenCalled();

      act(() => {
        harness.renderer.unmount();
      });

      // The handed-off socket now belongs to the Chat screen — unmounting
      // Finding Match after handoff must not tear it down out from under it.
      expect(fake.disconnect).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('connect_error: surfaces the mapped reason and does not attempt join_chat', async () => {
    const connectError: ChatSocketConnectError = { reason: 'AUTH_ERROR' };
    const fake = makeChatSocketService({ connectImpl: () => Promise.reject(connectError) });

    const harness = await render(makeSessionStore(TOKEN), () => fake.service);

    expect(harness.latest.phase).toBe('error');
    expect(harness.latest.error).toEqual({ reason: 'AUTH_ERROR' });
    expect(fake.joinChat).not.toHaveBeenCalled();
  });

  it('connect timeout: surfaces CONNECTION_TIMEOUT', async () => {
    const connectError: ChatSocketConnectError = { reason: 'CONNECTION_TIMEOUT' };
    const fake = makeChatSocketService({ connectImpl: () => Promise.reject(connectError) });

    const harness = await render(makeSessionStore(TOKEN), () => fake.service);

    expect(harness.latest.phase).toBe('error');
    expect(harness.latest.error).toEqual({ reason: 'CONNECTION_TIMEOUT' });
  });

  it('handleClose disconnects the socket and calls onClose', async () => {
    const fake = makeChatSocketService();
    const harness = await render(makeSessionStore(TOKEN), () => fake.service);

    act(() => {
      harness.latest.handleClose();
    });

    expect(fake.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.onClose).toHaveBeenCalledTimes(1);
  });

  it('unmounting before connect resolves disconnects and does not update state afterwards', async () => {
    let resolveConnect: () => void = () => {};
    const fake = makeChatSocketService({
      connectImpl: () => new Promise<void>(resolve => (resolveConnect = resolve)),
    });
    const sessionStore = makeSessionStore(TOKEN);

    let latest: ReturnType<typeof useFindingMatchController> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <Harness
          sessionStore={sessionStore}
          createChatSocketService={() => fake.service}
          onClose={jest.fn()}
          onMatched={jest.fn()}
          onReady={result => {
            latest = result;
          }}
        />,
      );
      await flushMicrotasks();
    });

    expect(latest?.phase).toBe('connecting');

    act(() => {
      renderer.unmount();
    });

    expect(fake.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConnect();
      await flushMicrotasks();
    });

    // The real assertion: without the `cancelled` guard, a connect that
    // resolves after unmount would still proceed to call joinChat — since
    // `latest` can no longer be updated by a render once unmounted, just
    // re-checking `phase` here wouldn't actually catch that regression.
    expect(fake.joinChat).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { AppState, BackHandler, type AppStateStatus } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { ChatSocketService } from '../../../services/chatSocket/ChatSocketService';
import { makeFakeTokenProvider } from '../../../services/chatSocket/testing/fakeChatSocketService';
import type {
  ChatEndedEvent,
  JoinChatAck,
  MatchFoundEvent,
  QueuedEvent,
  ReceiveMessageEvent,
  ServerErrorEvent,
} from '../../../services/chatSocket/types';
import type { AccessTokenResult, TokenProvider } from '../../../services/session/tokenProvider';
import type { TopicsSelection } from '../../topics/TopicsScreen';
import { useChatController } from '../useChatController';

const TEST_SELECTION: TopicsSelection = { mood: 'good', tags: ['life'], optedIn: false };

// Jest's RN preset defaults to the iOS platform file for BackHandler, whose
// addEventListener is a total no-op (no hardware back button on iOS) — it
// never stores the handler anywhere, so the real module can't be used to
// simulate a back press. Spy on the real object in place instead of
// replacing the module: capture the handler each addEventListener call
// receives and invoke it directly to simulate a press.
type BackPressHandler = () => boolean | undefined | void;

beforeEach(() => {
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove: () => {} }));
  // The RN mock doesn't report a foreground app; the controller only
  // reconnects right away while active.
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});

// Every harness still mounted at the end of a test is unmounted, so its
// skip countdown interval and any re-join loop don't keep Jest alive.
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  act(() => {
    mountedRenderers.splice(0).forEach(renderer => renderer.unmount());
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function pressHardwareBack(): boolean {
  const spy = BackHandler.addEventListener as jest.Mock;
  const lastCall = spy.mock.calls.at(-1) as [string, BackPressHandler] | undefined;
  if (!lastCall) {
    throw new Error('No hardwareBackPress listener is currently registered.');
  }
  return Boolean(lastCall[1]());
}

function makeChatSocketService() {
  const receiveHandlers = new Set<(event: ReceiveMessageEvent) => void>();
  const partnerTypingHandlers = new Set<() => void>();
  const partnerTypingStopHandlers = new Set<() => void>();
  const matchFoundHandlers = new Set<(event: MatchFoundEvent) => void>();
  const queuedHandlers = new Set<(event: QueuedEvent) => void>();
  const chatEndedHandlers = new Set<(event: ChatEndedEvent) => void>();
  const serverErrorHandlers = new Set<(event: ServerErrorEvent) => void>();
  const connectionLostHandlers = new Set<() => void>();
  const sendMessage = jest.fn();
  const sendTyping = jest.fn();
  const sendTypingStop = jest.fn();
  const sendSkipChat = jest.fn();
  const sendEndChat = jest.fn();
  const disconnect = jest.fn();
  const joinChat = jest.fn((): Promise<JoinChatAck> => Promise.resolve({ ok: true, status: 'matched' }));
  const connect = jest.fn((_getAccessToken: () => string | null) => Promise.resolve());

  const service: ChatSocketService = {
    connect,
    joinChat,
    onMatchFound: handler => {
      matchFoundHandlers.add(handler);
      return () => matchFoundHandlers.delete(handler);
    },
    onQueued: handler => {
      queuedHandlers.add(handler);
      return () => queuedHandlers.delete(handler);
    },
    sendMessage,
    onReceiveMessage: handler => {
      receiveHandlers.add(handler);
      return () => receiveHandlers.delete(handler);
    },
    sendTyping,
    sendTypingStop,
    onPartnerTyping: handler => {
      partnerTypingHandlers.add(handler);
      return () => partnerTypingHandlers.delete(handler);
    },
    onPartnerTypingStop: handler => {
      partnerTypingStopHandlers.add(handler);
      return () => partnerTypingStopHandlers.delete(handler);
    },
    sendSkipChat,
    sendEndChat,
    onChatEnded: handler => {
      chatEndedHandlers.add(handler);
      return () => chatEndedHandlers.delete(handler);
    },
    onServerError: handler => {
      serverErrorHandlers.add(handler);
      return () => serverErrorHandlers.delete(handler);
    },
    onConnectionLost: handler => {
      connectionLostHandlers.add(handler);
      return () => connectionLostHandlers.delete(handler);
    },
    disconnect,
  };

  return {
    service,
    sendMessage,
    sendTyping,
    sendTypingStop,
    sendSkipChat,
    sendEndChat,
    disconnect,
    joinChat,
    connect,
    emitQueued: () => queuedHandlers.forEach(handler => handler({ partner: null })),
    emitReceiveMessage: (event: ReceiveMessageEvent) => receiveHandlers.forEach(handler => handler(event)),
    emitPartnerTyping: () => partnerTypingHandlers.forEach(handler => handler()),
    emitPartnerTypingStop: () => partnerTypingStopHandlers.forEach(handler => handler()),
    emitMatchFound: (event: MatchFoundEvent = { partner: 'partner-2' }) =>
      matchFoundHandlers.forEach(handler => handler(event)),
    emitChatEnded: (event: ChatEndedEvent) => chatEndedHandlers.forEach(handler => handler(event)),
    emitServerError: (event: ServerErrorEvent) => serverErrorHandlers.forEach(handler => handler(event)),
    emitConnectionLost: () => connectionLostHandlers.forEach(handler => handler()),
  };
}

function Harness({
  service,
  tokenProvider,
  onLeave,
  onReauthRequired,
  onReady,
  backHandlerEnabled,
}: {
  service: ChatSocketService;
  tokenProvider: TokenProvider;
  onLeave: () => void;
  onReauthRequired: () => void;
  onReady: (result: ReturnType<typeof useChatController>) => void;
  backHandlerEnabled?: boolean;
}) {
  const result = useChatController(
    service,
    TEST_SELECTION,
    tokenProvider,
    onLeave,
    onReauthRequired,
    backHandlerEnabled,
  );
  onReady(result);
  return null;
}

async function render(
  service: ChatSocketService,
  tokenResults?: AccessTokenResult | AccessTokenResult[],
  backHandlerEnabled?: boolean,
) {
  const onLeave = jest.fn();
  const onReauthRequired = jest.fn();
  const { tokenProvider } = makeFakeTokenProvider(tokenResults);
  let latest: ReturnType<typeof useChatController> | undefined;
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness
        service={service}
        tokenProvider={tokenProvider}
        onLeave={onLeave}
        onReauthRequired={onReauthRequired}
        backHandlerEnabled={backHandlerEnabled}
        onReady={result => {
          latest = result;
        }}
      />,
    );
  });
  mountedRenderers.push(renderer);

  return {
    onLeave,
    onReauthRequired,
    renderer,
    get latest() {
      return latest!;
    },
  };
}

describe('useChatController', () => {
  it('starts the thread with a single system "connected" message', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    expect(harness.latest.messages).toEqual([
      { id: expect.any(String), sender: 'system', text: "Connected with anonymous partner. Say Hi!" },
    ]);
  });

  it('handleSend: emits the trimmed text, appends it locally as "me", and clears the input', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.setInputValue('  hey there  ');
    });
    act(() => {
      harness.latest.handleSend();
    });

    expect(fake.sendMessage).toHaveBeenCalledWith('hey there');
    expect(harness.latest.messages.at(-1)).toEqual({
      id: expect.any(String),
      sender: 'me',
      text: 'hey there',
    });
    expect(harness.latest.inputValue).toBe('');
  });

  it('handleSend: does nothing for blank/whitespace-only input', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.setInputValue('   ');
    });
    act(() => {
      harness.latest.handleSend();
    });

    expect(fake.sendMessage).not.toHaveBeenCalled();
    expect(harness.latest.messages).toHaveLength(1);
  });

  it('appends an incoming receive_message event as a partner message', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitReceiveMessage({ message: 'what are you into?' });
    });

    expect(harness.latest.messages.at(-1)).toEqual({
      id: expect.any(String),
      sender: 'partner',
      text: 'what are you into?',
    });
  });

  it('handleDismissIntro flips introDismissed to true', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    expect(harness.latest.introDismissed).toBe(false);

    act(() => {
      harness.latest.handleDismissIntro();
    });

    expect(harness.latest.introDismissed).toBe(true);
  });

  it('handleSkip is a no-op before the 10s skip unlock', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.handleSkip();
    });

    expect(fake.sendSkipChat).not.toHaveBeenCalled();
  });

  it('handleSkip sends skip_chat once the 10s skip unlock elapses', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    act(() => {
      harness.latest.handleSkip();
    });

    expect(fake.sendSkipChat).toHaveBeenCalledTimes(1);
  });

  it('handleStopSearching disconnects the socket and calls onLeave', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.handleStopSearching();
    });

    expect(fake.disconnect).toHaveBeenCalled();
    expect(harness.onLeave).toHaveBeenCalledTimes(1);
  });

  it('chat_ended with reason "skipped" sets rematchState to "rematching"', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    expect(harness.latest.rematchState).toBe('idle');

    act(() => {
      fake.emitChatEnded({ reason: 'skipped', by: 'partner' });
    });

    expect(harness.latest.rematchState).toBe('rematching');
  });

  it.each(['ended', 'disconnected'] as const)(
    'chat_ended with reason "%s" and by "partner" sets rematching and re-joins the queue',
    async reason => {
      const fake = makeChatSocketService();
      const harness = await render(fake.service);

      act(() => {
        fake.emitChatEnded({ reason, by: 'partner' });
      });

      expect(harness.latest.rematchState).toBe('rematching');
      expect(fake.joinChat).toHaveBeenCalledWith(TEST_SELECTION.tags, TEST_SELECTION.mood, TEST_SELECTION.optedIn);
    },
  );

  it.each(['ended', 'disconnected'] as const)(
    'chat_ended with reason "%s" and by "self" does not re-join (this client is the one leaving)',
    async reason => {
      const fake = makeChatSocketService();
      const harness = await render(fake.service);

      act(() => {
        fake.emitChatEnded({ reason, by: 'self' });
      });

      expect(harness.latest.rematchState).toBe('idle');
      expect(fake.joinChat).not.toHaveBeenCalled();
    },
  );

  it('pressing hardware back during an active chat opens the leave-confirm popup instead of leaving', async () => {
    const harness = await render(makeChatSocketService().service);

    expect(harness.latest.showLeaveConfirm).toBe(false);

    let handled!: boolean;
    act(() => {
      handled = pressHardwareBack();
    });

    expect(handled).toBe(true);
    expect(harness.latest.showLeaveConfirm).toBe(true);
    expect(harness.onLeave).not.toHaveBeenCalled();
  });

  it('pressing hardware back again while the leave-confirm popup is open dismisses it', async () => {
    const harness = await render(makeChatSocketService().service);

    act(() => {
      pressHardwareBack();
    });
    expect(harness.latest.showLeaveConfirm).toBe(true);

    act(() => {
      pressHardwareBack();
    });
    expect(harness.latest.showLeaveConfirm).toBe(false);
  });

  it('handleDismissLeaveConfirm closes the popup without leaving', async () => {
    const harness = await render(makeChatSocketService().service);

    act(() => {
      pressHardwareBack();
    });
    expect(harness.latest.showLeaveConfirm).toBe(true);

    act(() => {
      harness.latest.handleDismissLeaveConfirm();
    });

    expect(harness.latest.showLeaveConfirm).toBe(false);
    expect(harness.onLeave).not.toHaveBeenCalled();
  });

  it('handleConfirmLeave sends end_chat, disconnects, closes the popup, and calls onLeave', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      pressHardwareBack();
    });
    expect(harness.latest.showLeaveConfirm).toBe(true);

    act(() => {
      harness.latest.handleConfirmLeave();
    });

    expect(fake.sendEndChat).toHaveBeenCalledTimes(1);
    expect(fake.disconnect).toHaveBeenCalled();
    expect(harness.latest.showLeaveConfirm).toBe(false);
    expect(harness.onLeave).toHaveBeenCalledTimes(1);
  });

  it('pressing hardware back while rematching stops searching (same as the "Stop searching" button) instead of opening the leave-confirm popup', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitChatEnded({ reason: 'skipped', by: 'self' });
    });
    expect(harness.latest.rematchState).toBe('rematching');

    act(() => {
      pressHardwareBack();
    });

    expect(fake.disconnect).toHaveBeenCalled();
    expect(harness.onLeave).toHaveBeenCalledTimes(1);
    expect(harness.latest.showLeaveConfirm).toBe(false);
  });

  it('registers no hardware back listener while backHandlerEnabled is false (e.g. Feedback pushed over the chat)', async () => {
    await render(makeChatSocketService().service, undefined, false);

    expect(BackHandler.addEventListener).not.toHaveBeenCalled();
  });

  it('match_found while already chatting resets the thread and clears rematchState', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.setInputValue('hey');
    });
    act(() => {
      harness.latest.handleSend();
    });
    act(() => {
      fake.emitChatEnded({ reason: 'skipped', by: 'self' });
    });
    expect(harness.latest.rematchState).toBe('rematching');
    expect(harness.latest.messages.length).toBeGreaterThan(1);

    act(() => {
      jest.advanceTimersByTime(10_000); // exhaust the skip-unlock timer from the prior match
    });
    act(() => {
      fake.emitMatchFound();
    });

    expect(harness.latest.rematchState).toBe('idle');
    expect(harness.latest.messages).toEqual([
      { id: expect.any(String), sender: 'system', text: "Connected with anonymous partner. Say Hi!" },
    ]);
    expect(harness.latest.replyingTo).toBeNull();
    expect(harness.latest.canSkip).toBe(false);
  });

  it('handleSkip blocks a 4th skip once the 3-skip bucket is empty and shows a transient unavailable message instead of sending', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    act(() => {
      harness.latest.handleSkip();
      harness.latest.handleSkip();
      harness.latest.handleSkip();
    });
    expect(fake.sendSkipChat).toHaveBeenCalledTimes(3);

    act(() => {
      harness.latest.handleSkip();
    });
    expect(fake.sendSkipChat).toHaveBeenCalledTimes(3);
    expect(harness.latest.skipUnavailableMessage).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(harness.latest.skipUnavailableMessage).toBeNull();
  });

  it('handleSkip allows another skip once the bucket refills (~30s per skip, matching the server)', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    act(() => {
      harness.latest.handleSkip();
      harness.latest.handleSkip();
      harness.latest.handleSkip();
    });

    act(() => {
      jest.advanceTimersByTime(20_000);
      harness.latest.handleSkip();
    });
    expect(fake.sendSkipChat).toHaveBeenCalledTimes(3);

    act(() => {
      jest.advanceTimersByTime(11_000);
      harness.latest.handleSkip();
    });
    expect(fake.sendSkipChat).toHaveBeenCalledTimes(4);
  });

  it('a server rate_limited error shows the transient toast', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitServerError({ code: 429, reason: 'rate_limited' });
    });
    expect(harness.latest.skipUnavailableMessage).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(harness.latest.skipUnavailableMessage).toBeNull();
  });

  it('re-joining after the partner left retries a rate_limited join_chat, then clears the status on success', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    fake.joinChat.mockResolvedValueOnce({ ok: false, status: 'rate_limited' });
    const harness = await render(fake.service);

    await act(async () => {
      fake.emitChatEnded({ reason: 'ended', by: 'partner' });
    });
    expect(fake.joinChat).toHaveBeenCalledTimes(1);
    expect(harness.latest.rematchStatusMessage).not.toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(fake.joinChat).toHaveBeenCalledTimes(2);
    expect(harness.latest.rematchStatusMessage).toBeNull();
    expect(harness.latest.rematchState).toBe('rematching');
  });

  it('a join_chat ack that arrives after a new match_found does not trigger another re-join', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    let resolveJoin!: (ack: JoinChatAck) => void;
    fake.joinChat.mockImplementationOnce(() => new Promise<JoinChatAck>(resolve => (resolveJoin = resolve)));
    const harness = await render(fake.service);

    await act(async () => {
      fake.emitChatEnded({ reason: 'ended', by: 'partner' });
    });
    act(() => {
      fake.emitMatchFound();
    });
    await act(async () => {
      resolveJoin({ ok: false, status: 'rate_limited' });
    });
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });

    expect(fake.joinChat).toHaveBeenCalledTimes(1);
    expect(harness.latest.rematchStatusMessage).toBeNull();
  });

  it('re-joining reconnects after each failed join_chat, then gives up with a status message', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    fake.joinChat.mockRejectedValue({ reason: 'JOIN_TIMEOUT' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const harness = await render(fake.service);

    await act(async () => {
      fake.emitChatEnded({ reason: 'disconnected', by: 'partner' });
    });
    // findMatch backs off 1s, 2s, 4s between attempts, each on a fresh socket.
    for (const ms of [1_000, 2_000, 4_000]) {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    }

    expect(fake.joinChat).toHaveBeenCalledTimes(4);
    expect(fake.connect).toHaveBeenCalledTimes(3);
    expect(harness.latest.rematchStatusMessage).toMatch(/Couldn't find a new match/);
    expect(harness.latest.rematchGaveUp).toBe(true);
  });

  it.each([
    [{ reason: 'skipped', by: 'self' }, 'you_skipped'],
    [{ reason: 'skipped', by: 'partner' }, 'partner_skipped'],
    [{ reason: 'ended', by: 'partner' }, 'partner_ended'],
    [{ reason: 'disconnected', by: 'partner' }, 'partner_ended'],
  ] as const)('chat_ended %o sets rematchReason to "%s"', async (event, expected) => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitChatEnded(event);
    });

    expect(harness.latest.rematchReason).toBe(expected);
  });

  it('match_found clears rematchReason', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitChatEnded({ reason: 'skipped', by: 'partner' });
    });
    act(() => {
      fake.emitMatchFound();
    });

    expect(harness.latest.rematchReason).toBeNull();
  });

  it('handleRequestLeave opens the leave-confirm popup (the header button, for iOS)', async () => {
    const harness = await render(makeChatSocketService().service);

    act(() => {
      harness.latest.handleRequestLeave();
    });

    expect(harness.latest.showLeaveConfirm).toBe(true);
  });

  it.each([
    { reason: 'skipped', by: 'partner' },
    { reason: 'ended', by: 'partner' },
  ] as const)('chat_ended ($reason by $by) closes an open leave-confirm popup', async event => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.handleRequestLeave();
    });
    act(() => {
      fake.emitChatEnded(event);
    });

    expect(harness.latest.showLeaveConfirm).toBe(false);
  });

  it('a rate_limited error while rematching does not show the (hidden) toast', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitChatEnded({ reason: 'skipped', by: 'partner' });
    });
    act(() => {
      fake.emitServerError({ code: 429, reason: 'rate_limited' });
    });

    expect(harness.latest.skipUnavailableMessage).toBeNull();
  });

  it('re-join status stays neutral while rate limited: it keeps waiting for the bucket, never gives up', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    fake.joinChat.mockResolvedValue({ ok: false, status: 'rate_limited' });
    const harness = await render(fake.service);

    await act(async () => {
      fake.emitChatEnded({ reason: 'ended', by: 'partner' });
    });
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(15_000);
      });
    }

    expect(fake.joinChat).toHaveBeenCalledTimes(5);
    expect(harness.latest.rematchStatusMessage).toMatch(/busy/);
    expect(harness.latest.rematchGaveUp).toBe(false);
    act(() => {
      harness.renderer.unmount();
    });
  });

  it('after a skip, waits for the server to requeue us: queued does not trigger join_chat', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitChatEnded({ reason: 'skipped', by: 'self' });
      fake.emitQueued();
    });
    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000);
    });

    expect(fake.joinChat).not.toHaveBeenCalled();
    expect(harness.latest.rematchState).toBe('rematching');
  });

  it('a lost connection starts over: closes the leave popup, reconnects, and rejoins as "reconnecting"', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.handleRequestLeave();
    });
    await act(async () => {
      fake.emitConnectionLost();
    });

    expect(harness.latest.showLeaveConfirm).toBe(false);
    expect(harness.latest.rematchState).toBe('rematching');
    expect(harness.latest.rematchReason).toBe('reconnecting');
    expect(harness.latest.messages).toEqual([
      { id: expect.any(String), sender: 'system', text: 'You were disconnected from the chat.' },
    ]);
    expect(fake.disconnect).toHaveBeenCalled();
    expect(fake.connect).toHaveBeenCalledTimes(1);
    expect(fake.joinChat).toHaveBeenCalledWith(['life'], 'good', false);
    expect(harness.onLeave).not.toHaveBeenCalled();
  });

  it('a lost connection while backgrounded waits for the foreground before reconnecting', async () => {
    const addEventListener = jest.spyOn(AppState, 'addEventListener');
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    addEventListener.mockImplementation((_type, listener) => {
      appStateListener = listener as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as never;
    });
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    act(() => {
      appStateListener?.('background');
    });
    await act(async () => {
      fake.emitConnectionLost();
    });
    expect(fake.connect).not.toHaveBeenCalled();
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });

    await act(async () => {
      appStateListener?.('active');
    });

    expect(harness.latest.rematchReason).toBe('reconnecting');
    expect(fake.connect).toHaveBeenCalledTimes(1);
    expect(fake.joinChat).toHaveBeenCalledTimes(1);
  });

  it('a not_in_chat server error during a chat means we missed a disconnect: starts over', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    await act(async () => {
      fake.emitServerError({ code: 409, reason: 'not_in_chat' });
    });

    expect(harness.latest.rematchReason).toBe('reconnecting');
    expect(fake.connect).toHaveBeenCalledTimes(1);
  });

  it('an expired session while re-joining sends the user back to Entry', async () => {
    const fake = makeChatSocketService();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const harness = await render(fake.service, { status: 'reauth_required' });

    await act(async () => {
      fake.emitConnectionLost();
    });

    expect(harness.onReauthRequired).toHaveBeenCalledTimes(1);
    expect(fake.connect).not.toHaveBeenCalled();
    expect(harness.onLeave).not.toHaveBeenCalled();
  });

  it('handleStopSearching during a re-join stops it: no join_chat after leaving', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    fake.joinChat.mockResolvedValue({ ok: false, status: 'rate_limited' });
    const harness = await render(fake.service);

    await act(async () => {
      fake.emitChatEnded({ reason: 'ended', by: 'partner' });
    });
    act(() => {
      harness.latest.handleStopSearching();
    });
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(fake.joinChat).toHaveBeenCalledTimes(1);
    expect(harness.onLeave).toHaveBeenCalledTimes(1);
  });

  it('unmounting disconnects the socket', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.renderer.unmount();
    });

    expect(fake.disconnect).toHaveBeenCalled();
  });

  it('setInputValue sends typing once per active streak and typing_stop after 4s idle', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.setInputValue('h');
    });
    act(() => {
      harness.latest.setInputValue('he');
    });

    expect(fake.sendTyping).toHaveBeenCalledTimes(1);
    expect(fake.sendTypingStop).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(4_000);
    });

    expect(fake.sendTypingStop).toHaveBeenCalledTimes(1);
  });

  it('setInputValue sends typing_stop immediately when the input is cleared', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.setInputValue('hey');
    });
    act(() => {
      harness.latest.setInputValue('');
    });

    expect(fake.sendTypingStop).toHaveBeenCalledTimes(1);
  });

  it('handleSend sends typing_stop', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.setInputValue('hey');
    });
    act(() => {
      harness.latest.handleSend();
    });

    expect(fake.sendTypingStop).toHaveBeenCalledTimes(1);
  });

  it('surfaces partner_typing as partnerTyping and clears it on partner_typing_stop', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    expect(harness.latest.partnerTyping).toBe(false);

    act(() => {
      fake.emitPartnerTyping();
    });
    expect(harness.latest.partnerTyping).toBe(true);

    act(() => {
      fake.emitPartnerTypingStop();
    });
    expect(harness.latest.partnerTyping).toBe(false);
  });

  it('defensively auto-clears partnerTyping after 4s if no partner_typing_stop arrives', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitPartnerTyping();
    });
    expect(harness.latest.partnerTyping).toBe(true);

    act(() => {
      jest.advanceTimersByTime(4_000);
    });

    expect(harness.latest.partnerTyping).toBe(false);
  });

  it('handleReply sets replyingTo from a me/partner message but not a system message', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    expect(harness.latest.replyingTo).toBeNull();

    act(() => {
      harness.latest.handleReply(harness.latest.messages[0]); // system "Connected..." message
    });
    expect(harness.latest.replyingTo).toBeNull();

    act(() => {
      fake.emitReceiveMessage({ message: 'what are you into?' });
    });
    const partnerMessage = harness.latest.messages.at(-1)!;

    act(() => {
      harness.latest.handleReply(partnerMessage);
    });
    expect(harness.latest.replyingTo).toEqual({
      id: partnerMessage.id,
      sender: 'partner',
      text: 'what are you into?',
    });
  });

  it('handleCancelReply clears replyingTo', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitReceiveMessage({ message: 'hey' });
    });
    act(() => {
      harness.latest.handleReply(harness.latest.messages.at(-1)!);
    });
    expect(harness.latest.replyingTo).not.toBeNull();

    act(() => {
      harness.latest.handleCancelReply();
    });
    expect(harness.latest.replyingTo).toBeNull();
  });

  it('handleSend with an active reply sends a JSON {text, replyTo} envelope, tags the local message, and clears replyingTo', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitReceiveMessage({ message: 'what are you into?' });
    });
    const partnerMessage = harness.latest.messages.at(-1)!;

    act(() => {
      harness.latest.handleReply(partnerMessage);
    });
    act(() => {
      harness.latest.setInputValue('hiking!');
    });
    act(() => {
      harness.latest.handleSend();
    });

    expect(fake.sendMessage).toHaveBeenCalledWith(
      JSON.stringify({
        text: 'hiking!',
        replyTo: { id: partnerMessage.id, sender: 'partner', text: 'what are you into?' },
      }),
    );
    expect(harness.latest.messages.at(-1)).toEqual({
      id: expect.any(String),
      sender: 'me',
      text: 'hiking!',
      replyTo: { id: partnerMessage.id, sender: 'partner', text: 'what are you into?' },
    });
    expect(harness.latest.replyingTo).toBeNull();
  });

  it('handleSend truncates the quoted reply preview to 200 characters in the envelope', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);
    const longText = 'x'.repeat(500);

    act(() => {
      fake.emitReceiveMessage({ message: longText });
    });
    act(() => {
      harness.latest.handleReply(harness.latest.messages.at(-1)!);
    });
    act(() => {
      harness.latest.setInputValue('ok');
    });
    act(() => {
      harness.latest.handleSend();
    });

    const sent = JSON.parse(fake.sendMessage.mock.calls[0][0]);
    expect(sent.replyTo.text).toBe('x'.repeat(200));
  });

  it('handleSend falls back to plain text when the reply envelope would exceed the server limit of 2000', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);
    // Quotes in the text are escaped in JSON, doubling their length.
    const text = '"'.repeat(1_000);

    act(() => {
      fake.emitReceiveMessage({ message: 'hi' });
    });
    act(() => {
      harness.latest.handleReply(harness.latest.messages.at(-1)!);
    });
    act(() => {
      harness.latest.setInputValue(text);
    });
    act(() => {
      harness.latest.handleSend();
    });

    expect(fake.sendMessage).toHaveBeenCalledWith(text);
    // The local bubble matches what the partner receives: no quoted reply.
    expect(harness.latest.messages.at(-1)).toEqual({ id: expect.any(String), sender: 'me', text, replyTo: undefined });
  });

  it('handleSend without an active reply sends a plain string, unchanged from before', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.setInputValue('hey there');
    });
    act(() => {
      harness.latest.handleSend();
    });

    expect(fake.sendMessage).toHaveBeenCalledWith('hey there');
  });

  it('parses an incoming JSON {text, replyTo} envelope and flips replyTo.sender to this client\'s perspective', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      // From the partner's perspective: they replied to their own earlier message.
      fake.emitReceiveMessage({
        message: JSON.stringify({
          text: 'totally!',
          replyTo: { id: 'partner-msg-1', sender: 'me', text: 'I love hiking' },
        }),
      });
    });

    // From my perspective, the quoted message (their own, sender 'me' on their side)
    // should read as "partner"'s.
    expect(harness.latest.messages.at(-1)).toEqual({
      id: expect.any(String),
      sender: 'partner',
      text: 'totally!',
      replyTo: { id: 'partner-msg-1', sender: 'partner', text: 'I love hiking' },
    });
  });

  it('truncates an incoming replyTo.text to 200 characters', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitReceiveMessage({
        message: JSON.stringify({ text: 'yes', replyTo: { id: 'm1', sender: 'me', text: 'x'.repeat(5_000) } }),
      });
    });

    expect(harness.latest.messages.at(-1)?.replyTo?.text).toBe('x'.repeat(200));
  });

  it('falls back to plain text for a malformed/non-envelope JSON payload', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      fake.emitReceiveMessage({ message: '{"not": "an envelope"}' });
    });

    expect(harness.latest.messages.at(-1)).toEqual({
      id: expect.any(String),
      sender: 'partner',
      text: '{"not": "an envelope"}',
    });
  });
});

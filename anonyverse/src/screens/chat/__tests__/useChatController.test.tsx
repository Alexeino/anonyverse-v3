import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { ChatSocketService } from '../../../services/chatSocket/ChatSocketService';
import type { ReceiveMessageEvent } from '../../../services/chatSocket/types';
import { useChatController } from '../useChatController';

function makeChatSocketService() {
  const receiveHandlers = new Set<(event: ReceiveMessageEvent) => void>();
  const partnerTypingHandlers = new Set<() => void>();
  const partnerTypingStopHandlers = new Set<() => void>();
  const sendMessage = jest.fn();
  const sendTyping = jest.fn();
  const sendTypingStop = jest.fn();
  const disconnect = jest.fn();

  const service: ChatSocketService = {
    connect: jest.fn(() => Promise.resolve()),
    joinChat: jest.fn(() => Promise.resolve({ ok: true, status: 'matched' as const })),
    onMatchFound: () => () => {},
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
    disconnect,
  };

  return {
    service,
    sendMessage,
    sendTyping,
    sendTypingStop,
    disconnect,
    emitReceiveMessage: (event: ReceiveMessageEvent) => receiveHandlers.forEach(handler => handler(event)),
    emitPartnerTyping: () => partnerTypingHandlers.forEach(handler => handler()),
    emitPartnerTypingStop: () => partnerTypingStopHandlers.forEach(handler => handler()),
  };
}

function Harness({
  service,
  onLeave,
  onReady,
}: {
  service: ChatSocketService;
  onLeave: () => void;
  onReady: (result: ReturnType<typeof useChatController>) => void;
}) {
  const result = useChatController(service, onLeave);
  onReady(result);
  return null;
}

async function render(service: ChatSocketService) {
  const onLeave = jest.fn();
  let latest: ReturnType<typeof useChatController> | undefined;
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness
        service={service}
        onLeave={onLeave}
        onReady={result => {
          latest = result;
        }}
      />,
    );
  });

  return {
    onLeave,
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

  it('handleLeave is a no-op before the 10s skip unlock', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.handleLeave();
    });

    expect(fake.disconnect).not.toHaveBeenCalled();
    expect(harness.onLeave).not.toHaveBeenCalled();
  });

  it('handleLeave disconnects the socket and calls onLeave once the 10s skip unlock elapses', async () => {
    jest.useFakeTimers();
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    act(() => {
      harness.latest.handleLeave();
    });

    expect(fake.disconnect).toHaveBeenCalled();
    expect(harness.onLeave).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
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
    jest.useRealTimers();
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
    jest.useRealTimers();
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

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { ChatSocketService } from '../../../services/chatSocket/ChatSocketService';
import type { ReceiveMessageEvent } from '../../../services/chatSocket/types';
import { useChatController } from '../useChatController';

function makeChatSocketService() {
  const receiveHandlers = new Set<(event: ReceiveMessageEvent) => void>();
  const sendMessage = jest.fn();
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
    disconnect,
  };

  return {
    service,
    sendMessage,
    disconnect,
    emitReceiveMessage: (event: ReceiveMessageEvent) => receiveHandlers.forEach(handler => handler(event)),
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

  it('handleLeave disconnects the socket and calls onLeave', async () => {
    const fake = makeChatSocketService();
    const harness = await render(fake.service);

    act(() => {
      harness.latest.handleLeave();
    });

    expect(fake.disconnect).toHaveBeenCalled();
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
});

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import { makeFakeTokenProvider } from '../../../services/chatSocket/testing/fakeChatSocketService';
import { FeedbackSheet } from '../FeedbackSheet';
import type { FeedbackDefaults } from '../useFeedbackController';

// Without initialMetrics, SafeAreaProvider renders nothing until a native
// layout event that never fires under the test renderer.
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
}

function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  return act(async () => {
    renderer.root.findByProps({ accessibilityLabel: label }).props.onPress();
  });
}

async function renderSheet(defaults: FeedbackDefaults = {}) {
  const submit = jest.fn(() => Promise.resolve({ status: 'submitted' as const, id: 1 }));
  const feedbackService: FeedbackService = { submit };
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <FeedbackSheet
          defaults={defaults}
          onClose={onClose}
          tokenProvider={makeFakeTokenProvider().tokenProvider}
          feedbackService={feedbackService}
        />
      </SafeAreaProvider>,
    );
  });

  return { renderer, submit, onClose };
}

describe('FeedbackSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports a bug with taps only, then closes from the thank-you step', async () => {
    const { renderer, submit, onClose } = await renderSheet({ screen: 'ChatScreen' });

    expect(texts(renderer)).toContain('How was your experience?');
    await press(renderer, 'Bad');
    expect(texts(renderer)).toContain('What went wrong?');

    await press(renderer, "Messages didn't send");
    await press(renderer, 'Send feedback');

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BUG', reasons: ['BUG_MESSAGES_NOT_SENT'], message: null, screen: 'ChatScreen' }),
      'access-token',
    );
    expect(texts(renderer)).toContain('Thanks for your feedback!');

    await press(renderer, 'Done');
    await act(async () => {
      jest.runAllTimers();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('starts as "Rate us", then shows the rating question as the title once a star is tapped', async () => {
    const { renderer } = await renderSheet();

    await press(renderer, 'Good');
    expect(texts(renderer)).toContain('Rate us');
    expect(texts(renderer)).not.toContain('What would make it a 5?');
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Feedback message' })).toHaveLength(0);

    await press(renderer, 'Rate 4 out of 5');
    expect(texts(renderer)).toContain('Pretty good');
    expect(texts(renderer)).toContain('What would make it a 5?');
    expect(texts(renderer)).not.toContain('Rate us');
  });

  it('closes when the area above the card is tapped', async () => {
    const { renderer, onClose } = await renderSheet();

    await press(renderer, 'Close feedback');
    await act(async () => {
      jest.runAllTimers();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

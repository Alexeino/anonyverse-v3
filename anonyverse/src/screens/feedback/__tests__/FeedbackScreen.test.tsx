import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import { makeFakeTokenProvider } from '../../../services/chatSocket/testing/fakeChatSocketService';
import { FeedbackScreen } from '../FeedbackScreen';

// Without initialMetrics, SafeAreaProvider renders nothing until a native
// layout event that never fires under the test renderer.
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const { tokenProvider } = makeFakeTokenProvider();

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
}

describe('FeedbackScreen', () => {
  it('submits a message and shows the success state', async () => {
    const submit = jest.fn(() => Promise.resolve({ status: 'submitted' as const, id: 1 }));
    const feedbackService: FeedbackService = { submit };
    const onClose = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
          <FeedbackScreen
            defaults={{ screen: 'ChatListScreen' }}
            onClose={onClose}
            tokenProvider={tokenProvider}
            feedbackService={feedbackService}
          />
        </SafeAreaProvider>,
      );
    });

    expect(texts(renderer)).toContain('Send feedback');

    await act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText('Love it');
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Next' }).props.onPress();
    });
    expect(texts(renderer)).toContain('Rate us');

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Rate 4 out of 5' }).props.onPress();
    });
    expect(texts(renderer)).toContain('Pretty good');

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Send feedback' }).props.onPress();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toContain('Thanks for your feedback!');

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

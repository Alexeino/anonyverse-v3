import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UnderageModal } from '../UnderageModal';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function texts(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{element}</SafeAreaProvider>);
  });
  return renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
}

describe('UnderageModal', () => {
  it('shows when the lock lifts', async () => {
    const shown = await texts(<UnderageModal lockUntil={{ year: 2030, month: 3, day: 12 }} />);

    expect(shown).toContain('See you on');
    expect(shown).toContain('12 March 2030');
  });

  it('falls back to a general message without a date', async () => {
    const shown = await texts(<UnderageModal />);

    expect(shown).toContain("We'll be here when you're ready.");
    expect(shown).not.toContain('See you on');
  });

  it('has no button, so there is no way forward', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
          <UnderageModal lockUntil={{ year: 2030, month: 3, day: 12 }} />
        </SafeAreaProvider>,
      );
    });

    expect(renderer.root.findAll(node => typeof node.props.onPress === 'function')).toHaveLength(0);
  });
});

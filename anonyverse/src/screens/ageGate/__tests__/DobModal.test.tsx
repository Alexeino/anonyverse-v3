import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DobModal } from '../DobModal';
import { WheelPicker } from '../WheelPicker';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const NOW = () => new Date(2026, 9, 1);

async function render() {
  const onConfirm = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <DobModal onConfirm={onConfirm} now={NOW} />
      </SafeAreaProvider>,
    );
  });

  const pick = (label: string, value: number) =>
    act(async () => {
      renderer.root.findAll(node => node.type === WheelPicker && node.props.label === label)[0].props.onChange(value);
    });
  const wheel = (label: string) =>
    renderer.root.findAll(node => node.type === WheelPicker && node.props.label === label)[0];
  const continueButton = () => renderer.root.findAllByProps({ accessibilityRole: 'button' }).find(node => node.props.onPress);
  const texts = () => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

  return { onConfirm, pick, continueButton, texts, wheel };
}

describe('DobModal', () => {
  it('keeps Continue disabled until a full, real date is picked, then confirms it', async () => {
    const modal = await render();
    expect(modal.continueButton()).toBeUndefined();

    await modal.pick('Day', 15);
    await modal.pick('Month', 6);
    expect(modal.continueButton()).toBeUndefined();

    await modal.pick('Year', 2004);
    await act(async () => {
      modal.continueButton()!.props.onPress();
    });

    expect(modal.onConfirm).toHaveBeenCalledWith({ year: 2004, month: 6, day: 15 });
  });

  it("says when the date doesn't exist", async () => {
    const modal = await render();
    await modal.pick('Day', 31);
    await modal.pick('Month', 2);
    await modal.pick('Year', 2000);

    expect(modal.texts()).toContain("That date doesn't exist.");
    expect(modal.continueButton()).toBeUndefined();
  });

  it('rejects a date in the future', async () => {
    const modal = await render();
    await modal.pick('Day', 2);
    await modal.pick('Month', 10);
    await modal.pick('Year', 2026);

    expect(modal.continueButton()).toBeUndefined();
  });

  it('accepts 29 Feb in a leap year', async () => {
    const modal = await render();
    await modal.pick('Day', 29);
    await modal.pick('Month', 2);
    await modal.pick('Year', 2004);

    expect(modal.continueButton()).toBeDefined();
  });

  it('confirms only once when Continue is tapped twice', async () => {
    const modal = await render();
    await modal.pick('Day', 15);
    await modal.pick('Month', 6);
    await modal.pick('Year', 2004);
    const button = modal.continueButton()!;
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
    });

    expect(modal.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('offers years from this year back to 1900', async () => {
    const modal = await render();
    const yearWheel = modal.wheel('Year');

    expect(yearWheel.props.options[1]).toEqual({ label: '2026', value: 2026 });
    expect(yearWheel.props.options[yearWheel.props.options.length - 1]).toEqual({ label: '1900', value: 1900 });
  });
});

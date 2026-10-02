import React from 'react';
import { ScrollView } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { WheelPicker, type WheelOption } from '../WheelPicker';

const OPTIONS: WheelOption[] = [
  { label: '—', value: null },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
];
const ITEM_HEIGHT = 40;

async function render(value: number | null = null) {
  const onChange = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <WheelPicker label="Day" options={OPTIONS} value={value} onChange={onChange} />,
    );
  });
  const scrollTo = (y: number) =>
    act(async () => {
      renderer.root.findByType(ScrollView).props.onScroll({ nativeEvent: { contentOffset: { y } } });
    });
  const wheel = () => renderer.root.findByProps({ accessibilityRole: 'adjustable' });
  return { onChange, scrollTo, wheel };
}

describe('WheelPicker', () => {
  it('picks the row centred in the wheel', async () => {
    const picker = await render();
    await picker.scrollTo(ITEM_HEIGHT * 2);

    expect(picker.onChange).toHaveBeenCalledWith(2);
  });

  it('rounds to the nearest row mid-scroll', async () => {
    const picker = await render();
    await picker.scrollTo(ITEM_HEIGHT * 1.4);

    expect(picker.onChange).toHaveBeenCalledWith(1);
  });

  it('stays on the first and last rows when scrolled past either end', async () => {
    const picker = await render(1);
    await picker.scrollTo(-120);
    await picker.scrollTo(ITEM_HEIGHT * 50);

    expect(picker.onChange.mock.calls).toEqual([[null], [3]]);
  });

  it('does not report a change when the centred row is already selected', async () => {
    const picker = await render(2);
    await picker.scrollTo(ITEM_HEIGHT * 2);

    expect(picker.onChange).not.toHaveBeenCalled();
  });

  it('tells screen readers the current value', async () => {
    expect((await render()).wheel().props.accessibilityValue).toEqual({ text: 'Not selected' });
    expect((await render(3)).wheel().props.accessibilityValue).toEqual({ text: '3' });
  });
});

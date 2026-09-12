import React from 'react';
import { Animated } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useCrossfade, type UseCrossfadeResult } from '../useCrossfade';

type Callback = (result: { finished: boolean }) => void;

function mockAnimatedTiming() {
  const pending: Callback[] = [];

  jest.spyOn(Animated, 'timing').mockImplementation(
    () =>
      ({
        start: (cb?: Callback) => {
          if (cb) {
            pending.push(cb);
          }
        },
        stop: jest.fn(),
        reset: jest.fn(),
      }) as unknown as Animated.CompositeAnimation,
  );

  return {
    /** Resolves the oldest still-pending Animated.timing().start() call. */
    resolveNext(finished = true) {
      const cb = pending.shift();
      if (!cb) {
        throw new Error('No pending Animated.timing() call to resolve');
      }
      cb({ finished });
    },
    pendingCount: () => pending.length,
  };
}

function Harness({
  value,
  onReady,
}: {
  value: string;
  onReady: (result: UseCrossfadeResult<string>) => void;
}) {
  const result = useCrossfade(value);
  onReady(result);
  return null;
}

describe('useCrossfade', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps showing the old value until the fade-out completes, then swaps', () => {
    const timing = mockAnimatedTiming();
    let latest: UseCrossfadeResult<string> | undefined;
    const onReady = (result: UseCrossfadeResult<string>) => {
      latest = result;
    };

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<Harness value="a" onReady={onReady} />);
    });
    expect(latest?.displayValue).toBe('a');

    act(() => {
      renderer.update(<Harness value="b" onReady={onReady} />);
    });

    // Fade-out is in flight — the old value is still what's displayed.
    expect(latest?.displayValue).toBe('a');
    expect(timing.pendingCount()).toBe(1);

    act(() => {
      timing.resolveNext();
    });

    // Fade-out finished — the new value swaps in, and a fade-in starts.
    expect(latest?.displayValue).toBe('b');
    expect(timing.pendingCount()).toBe(0);
  });

  it('does not swap if the fade-out animation is interrupted (finished: false)', () => {
    const timing = mockAnimatedTiming();
    let latest: UseCrossfadeResult<string> | undefined;
    const onReady = (result: UseCrossfadeResult<string>) => {
      latest = result;
    };

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<Harness value="a" onReady={onReady} />);
    });

    act(() => {
      renderer.update(<Harness value="b" onReady={onReady} />);
    });

    act(() => {
      timing.resolveNext(false);
    });

    expect(latest?.displayValue).toBe('a');
  });
});

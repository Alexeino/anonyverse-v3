import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

const DEFAULT_DURATION_MS = 200;

export interface UseCrossfadeResult<T> {
  /** The value to actually render — lags `value` until the fade-out completes. */
  displayValue: T;
  /** Bind to an Animated.View's opacity to drive the fade. */
  opacity: Animated.Value;
}

/**
 * Cross-fades a render swap driven by `value` instead of cutting instantly:
 * fades the current content out, swaps `displayValue` to the new value
 * once fully transparent, then fades back in. Used to make phase/screen
 * swaps in the onboarding flow (Verification's verifying/verified content,
 * and the Verification -> Mood Select hand-off) read as one continuous
 * transition rather than a hard cut.
 */
export function useCrossfade<T>(
  value: T,
  durationMs: number = DEFAULT_DURATION_MS,
): UseCrossfadeResult<T> {
  const opacity = useRef(new Animated.Value(1)).current;
  const [displayValue, setDisplayValue] = useState(value);
  const displayValueRef = useRef(value);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (value === displayValueRef.current) {
      return;
    }

    let currentAnimation = Animated.timing(opacity, {
      toValue: 0,
      duration: durationMs,
      useNativeDriver: true,
    });

    currentAnimation.start(result => {
      if (!result.finished || !mountedRef.current) {
        return;
      }
      displayValueRef.current = value;
      setDisplayValue(value);
      currentAnimation = Animated.timing(opacity, {
        toValue: 1,
        duration: durationMs,
        useNativeDriver: true,
      });
      currentAnimation.start();
    });

    // Stops whichever half of the fade is currently running, whether
    // that's because the component unmounted or `value` changed again
    // before the crossfade finished — otherwise the animation keeps
    // driving `opacity` after this effect has been superseded.
    return () => {
      currentAnimation.stop();
    };
  }, [value, durationMs, opacity]);

  return { displayValue, opacity };
}

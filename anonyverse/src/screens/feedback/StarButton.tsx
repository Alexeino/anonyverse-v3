import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../../design/tokens';

const STAR_SIZE = 40;
const STAR_POP_STAGGER_MS = 45;
const STAR_OUTLINE = 'rgba(50, 21, 101, 0.28)';
const STAR_PATH =
  'M12 2.6l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.41l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.6z';

export interface StarButtonProps {
  value: number;
  filled: boolean;
  selected: boolean;
  tapped: boolean;
  /** Changes on every tap to replay the pop. */
  popToken: number;
  onPress: () => void;
}

export function StarButton({ value, filled, selected, tapped, popToken, onPress }: StarButtonProps) {
  const pop = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Reset first so a pop stopped mid-flight doesn't leave the star enlarged.
    pop.setValue(0);
    burst.setValue(0);
    if (popToken === 0 || (!filled && !tapped)) {
      return;
    }
    const animation = Animated.sequence([
      Animated.delay(filled ? (value - 1) * STAR_POP_STAGGER_MS : 0),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pop, { toValue: 1, duration: 110, useNativeDriver: true }),
          Animated.spring(pop, { toValue: 0, friction: 3.5, tension: 180, useNativeDriver: true }),
        ]),
        filled
          ? Animated.timing(burst, { toValue: 1, duration: 420, useNativeDriver: true })
          : Animated.delay(0),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [popToken, filled, tapped, value, pop, burst]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, filled ? 1.35 : 1.15] });
  const rotate = pop.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-12deg'] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Rate ${value} out of 5`}
      accessibilityState={{ selected }}
      hitSlop={6}
      style={styles.starButton}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.starBurst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]}
      />
      <Animated.View style={{ transform: [{ scale }, { rotate }] }}>
        <Svg width={STAR_SIZE} height={STAR_SIZE} viewBox="0 0 24 24">
          <Defs>
            <SvgLinearGradient id={`starFill${value}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bubblePink} />
              <Stop offset="1" stopColor={colors.accentPink} />
            </SvgLinearGradient>
          </Defs>
          <Path
            d={STAR_PATH}
            fill={filled ? `url(#starFill${value})` : colors.white}
            stroke={filled ? colors.moodGoodLabel : STAR_OUTLINE}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  starButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBurst: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.bubblePink,
    backgroundColor: colors.moodGoodChipSelected,
  },
});

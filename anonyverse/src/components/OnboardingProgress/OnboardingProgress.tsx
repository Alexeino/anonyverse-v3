import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../../design/tokens';

export interface OnboardingProgressProps {
  /** Number of steps, out of totalSteps, shown as complete/active. */
  activeSteps: number;
  totalSteps?: number;
}

const TRANSITION_MS = 350;

/**
 * The 3-segment step indicator at the top of the first-time onboarding
 * frames (Verification: node 10:798-10:800, Verified: node 10:820-10:822,
 * Mood Select: node 10:845-10:847). Each segment cross-fades between its
 * active/inactive color instead of snapping, since activeSteps changes
 * live within a screen (e.g. Verification's 1 -> 2 on success).
 */
export function OnboardingProgress({
  activeSteps,
  totalSteps = 3,
}: OnboardingProgressProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: totalSteps }, (_, index) => (
        <ProgressSegment key={index} active={index < activeSteps} />
      ))}
    </View>
  );
}

function ProgressSegment({ active }: { active: boolean }) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: TRANSITION_MS,
      useNativeDriver: false, // color interpolation isn't supported by the native driver
    }).start();
  }, [active, progress]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.progressTrackInactive, colors.ink],
  });

  return <Animated.View style={[styles.segment, { backgroundColor }]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 7,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
});

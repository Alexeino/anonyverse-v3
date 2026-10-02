import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../../design/tokens';

export function AgeModalShell({ children }: { children: React.ReactNode }) {
  const backdrop = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(card, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }),
    ]).start();
  }, [backdrop, card]);

  const scale = card.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const translateY = card.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdrop }]} pointerEvents="none">
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="light"
          blurAmount={3}
          reducedTransparencyFallbackColor={colors.gradientBackground[0]}
        />
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      </Animated.View>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Animated.View style={[styles.card, { opacity: card, transform: [{ scale }, { translateY }] }]}>
          {children}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// Both age popups share this so they're the same size; fits the date-of-birth popup's content.
const CARD_MIN_HEIGHT = 460;

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenHorizontal,
  },
  scrim: {
    backgroundColor: colors.sheetScrim,
  },
  card: {
    minHeight: CARD_MIN_HEIGHT,
    padding: 24,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    shadowColor: colors.sheetShadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 12,
  },
});

import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { MascotPair } from '../../components/MascotPair/MascotPair';
import { colors, fontFamily, radii, spacing, typography } from '../../design/tokens';
import { rgbaAlpha } from '../../design/svgColor';
import type { RematchReason } from './useChatController';

const miliLookingOut = require('../../assets/images/mili-looking-out.png');
const miloExcited = require('../../assets/images/milo-excited.png');

const RING_SIZE = 160;
const GLOW_SIZE = 110;
const MASCOT_AREA_HEIGHT = RING_SIZE + 44;
const PAIR_WIDTH = 194;
const GLOW_COLOR = 'rgba(242,165,224,0.34)';
const GLOW_COLOR_TRANSPARENT = 'rgba(242,165,224,0)';

const REASON_SUBTITLE: Record<RematchReason, string> = {
  you_skipped: 'You skipped the chat, finding a new one',
  partner_skipped: 'Your partner skipped you, looking for a new one',
  partner_ended: 'Your partner has ended the chat, finding a new partner',
};
const DEFAULT_SUBTITLE = 'Looking for a new partner';

export interface FindingNewMatchModalProps {
  /** Why this rematch started; null falls back to a generic subtext. */
  reason: RematchReason | null;
  /** Shown under the subtitle when re-joining the queue is throttled or has given up. */
  statusMessage?: string | null;
  /** Styles statusMessage as an error; a "retrying" status stays neutral. */
  statusIsError?: boolean;
  onStopSearching: () => void;
  onReport: () => void;
}

export function FindingNewMatchModal({ reason, statusMessage, statusIsError, onStopSearching, onReport }: FindingNewMatchModalProps) {
  const subtitle = reason ? REASON_SUBTITLE[reason] : DEFAULT_SUBTITLE;

  return (
    <View style={styles.root}>
      <BlurView
        style={StyleSheet.absoluteFill}
        blurType="light"
        blurAmount={18}
        reducedTransparencyFallbackColor={colors.gradientBackground[0]}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Text style={styles.breadcrumb}>Finding you a new match</Text>

        <View style={styles.spacer} />

        <View style={styles.card}>
          <View style={styles.mascotArea}>
            <View style={styles.dashedRing} />

            <Svg width={GLOW_SIZE} height={GLOW_SIZE} style={styles.glow} pointerEvents="none">
              <Defs>
                <RadialGradient id="findingNewMatchGlow" cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0%" stopColor={GLOW_COLOR} stopOpacity={rgbaAlpha(GLOW_COLOR)} />
                  <Stop
                    offset="70%"
                    stopColor={GLOW_COLOR_TRANSPARENT}
                    stopOpacity={rgbaAlpha(GLOW_COLOR_TRANSPARENT)}
                  />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width="100%" height="100%" fill="url(#findingNewMatchGlow)" />
            </Svg>

            <MascotPair
              height={MASCOT_AREA_HEIGHT}
              pairWidth={PAIR_WIDTH}
              leftImage={miliLookingOut}
              rightImage={miloExcited}
              leftLayout={{ left: 4, top: 12, width: 80, height: 95 }}
              rightLayout={{ left: 108, top: 100, width: 86, height: 88 }}
            />

            <View style={[styles.sparkle, styles.sparkleOne, { backgroundColor: colors.bubblePink }]} />
            <View style={[styles.sparkle, styles.sparkleTwo, { backgroundColor: colors.blobPurple[1] }]} />
            <View style={[styles.sparkle, styles.sparkleThree, { backgroundColor: colors.bubbleBlue }]} />
          </View>

          <Text style={styles.title}>{'Finding you\nsomeone new'}</Text>
          <Text style={styles.subtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {subtitle}
          </Text>
          {statusMessage ? (
            <Text style={[styles.statusMessage, statusIsError && styles.statusMessageError]} accessibilityLiveRegion="polite">
              {statusMessage}
            </Text>
          ) : null}

          <SearchingDots />

          <Pressable
            onPress={onStopSearching}
            accessibilityRole="button"
            accessibilityLabel="Stop searching"
            style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
          >
            <Text style={styles.stopButtonLabel}>Stop searching</Text>
          </Pressable>

          <Pressable
            onPress={onReport}
            accessibilityRole="button"
            accessibilityLabel="Report that chat"
            style={({ pressed }) => [styles.reportLink, pressed && styles.pressed]}
          >
            <Text style={styles.reportLinkLabel}>Report that chat</Text>
          </Pressable>
        </View>

        <View style={styles.spacer} />

        <Text style={styles.footer}>That chat is closed — nothing was saved for either of you.</Text>
      </SafeAreaView>
    </View>
  );
}

function SearchingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ]),
      );

    const animations = [pulse(dot1, 0), pulse(dot2, 200), pulse(dot3, 400)];
    animations.forEach(animation => animation.start());
    return () => animations.forEach(animation => animation.stop());
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, { backgroundColor: colors.bubblePink, opacity: dot1 }]} />
      <Animated.View style={[styles.dot, { backgroundColor: colors.blobPurple[1], opacity: dot2 }]} />
      <Animated.View style={[styles.dot, { backgroundColor: colors.bubbleBlue, opacity: dot3 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 12,
    paddingBottom: 24,
  },
  breadcrumb: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.moodLowLabel,
  },
  spacer: {
    flex: 1,
  },
  card: {
    padding: 24,
    borderRadius: 28,
    alignItems: 'center',
    backgroundColor: colors.white,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 5,
  },
  mascotArea: {
    width: '100%',
    height: MASCOT_AREA_HEIGHT,
  },
  dashedRing: {
    position: 'absolute',
    top: (MASCOT_AREA_HEIGHT - RING_SIZE) / 2,
    left: '50%',
    marginLeft: -RING_SIZE / 2,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.progressTrackInactive,
  },
  glow: {
    position: 'absolute',
    top: (MASCOT_AREA_HEIGHT - GLOW_SIZE) / 2,
    left: '50%',
    marginLeft: -GLOW_SIZE / 2,
  },
  sparkle: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  sparkleOne: {
    top: 28,
    left: '36%',
    opacity: 0.64,
  },
  sparkleTwo: {
    top: 50,
    left: '54%',
    opacity: 0.55,
  },
  sparkleThree: {
    top: 74,
    left: '66%',
    opacity: 0.59,
  },
  title: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 27,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 11,
    alignSelf: 'stretch',
    color: colors.body,
  },
  statusMessage: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.body,
  },
  statusMessageError: {
    color: colors.danger,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  stopButton: {
    marginTop: 20,
    width: '100%',
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.disabledButtonBackground,
  },
  pressed: {
    opacity: 0.85,
  },
  stopButtonLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  reportLink: {
    marginTop: 14,
    paddingVertical: 4,
  },
  reportLinkLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.danger,
  },
  footer: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.overlayText,
  },
});

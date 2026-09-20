import React, { useId, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { OnboardingProgress } from '../../components/OnboardingProgress/OnboardingProgress';
import { StatusCard } from '../../components/StatusCard/StatusCard';
import { colors, fontFamily, spacing, typography } from '../../design/tokens';

const miliHappy = require('../../assets/images/mili-happy.png');
const miloSad = require('../../assets/images/milo-sad.png');

export type Mood = 'good' | 'low';

// Lets the tapped card visibly light up before the screen hands off, so the
// choice reads as registered rather than an instant cut.
const SELECT_HANDOFF_DELAY_MS = 350;

export interface MoodSelectScreenProps {
  /**
   * Shows the 3-segment onboarding progress bar — true for the first-time
   * verification flow (Figma node 10:839), false for the returning-user
   * flow reached from Chat List's "Start a chat" (same layout, no bar).
   */
  showProgress: boolean;
  onSelectMood: (mood: Mood) => void;
}

/**
 * Mood Select screen — matches the Anonyverse Figma frame "Mood Select"
 * (node 10:839). Picking a mood is the action itself (no separate
 * "Continue" CTA): tapping a card marks it selected and hands off after
 * SELECT_HANDOFF_DELAY_MS, long enough for the selected/dimmed styling to
 * register before the screen changes.
 */
export function MoodSelectScreen({ showProgress, onSelectMood }: MoodSelectScreenProps) {
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);

  const handlePick = (mood: Mood) => {
    if (selectedMood) {
      return;
    }
    setSelectedMood(mood);
    setTimeout(() => onSelectMood(mood), SELECT_HANDOFF_DELAY_MS);
  };

  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          {showProgress ? <OnboardingProgress activeSteps={3} /> : null}

          <Text style={[typography.headline, styles.headline]}>
            {"How's your mood\ntoday?"}
          </Text>

          <Text style={[typography.body, styles.subtext]}>
            {"We'll put you in the right space, with\nsomeone who gets it."}
          </Text>

          <View style={styles.cardsRow}>
            <MoodCard
              gradient={colors.moodGoodCardGradient}
              borderColor={colors.bubblePink}
              image={miliHappy}
              imageStyle={styles.miliHappyImage}
              label="I'm feeling good"
              labelColor={colors.moodGoodLabel}
              subtitle={"Mili's day is going\nwell too"}
              selected={selectedMood === 'good'}
              dimmed={selectedMood !== null && selectedMood !== 'good'}
              onPress={() => handlePick('good')}
            />
            <MoodCard
              gradient={colors.moodLowCardGradient}
              borderColor={colors.moodLowBorder}
              image={miloSad}
              imageStyle={styles.miloSadImage}
              label="I'm feeling low"
              labelColor={colors.moodLowLabel}
              subtitle="Milo will sit with you"
              selected={selectedMood === 'low'}
              dimmed={selectedMood !== null && selectedMood !== 'low'}
              onPress={() => handlePick('low')}
            />
          </View>

          <View style={styles.spacer} />

          <StatusCard
            variant="info"
            icon={'♡'}
            title="You're in a safe space"
            subtitle="Your feelings matter. Always."
          />

          <Text style={[typography.caption, styles.footer]}>
            This only shapes today's match — nothing is saved.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

interface MoodCardProps {
  gradient: readonly [string, string];
  borderColor: string;
  image: ImageSourcePropType;
  imageStyle: object;
  label: string;
  labelColor: string;
  subtitle: string;
  selected: boolean;
  dimmed: boolean;
  onPress: () => void;
}

function MoodCard({
  gradient,
  borderColor,
  image,
  imageStyle,
  label,
  labelColor,
  subtitle,
  selected,
  dimmed,
  onPress,
}: MoodCardProps) {
  // A stable id per mounted instance — deriving it from the label instead
  // would collide if labels ever changed (copy edit, localisation) or two
  // cards with the same label were mounted at once, since SVG gradient
  // ids are global within a react-native-svg rendering context.
  const gradientId = `moodCardGradient-${useId()}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.moodCard,
        { borderColor },
        selected && styles.moodCardSelected,
        dimmed && styles.moodCardDimmed,
        pressed && styles.moodCardPressed,
      ]}
    >
      {selected ? (
        <View style={styles.moodCardCheck}>
          <Text style={styles.moodCardCheckGlyph}>{'✓'}</Text>
        </View>
      ) : null}
      {/* Clipping lives on this absolutely-positioned, unshadowed layer —
          putting overflow:'hidden' directly on the Pressable above (which
          also carries the shadow) would defeat the shadow on iOS, and
          nesting another flex:1 wrapper to hold the shadow instead
          collapses this card's height (two nested flex:1 views with no
          intrinsic size between them). */}
      <View style={[StyleSheet.absoluteFill, styles.moodCardClip]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={gradient[0]} />
              <Stop offset="100%" stopColor={gradient[1]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      </View>

      <Image source={image} resizeMode="contain" style={imageStyle} />

      <View style={styles.moodCardText}>
        <Text style={[styles.moodLabel, { color: labelColor }]}>{label}</Text>
        <Text style={styles.moodSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.gradientBackground[0],
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 26,
    paddingBottom: 24,
  },
  headline: {
    marginTop: 32,
  },
  subtext: {
    marginTop: 13,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 28,
  },
  moodCard: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 2,
    padding: 16,
    alignItems: 'center',
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  moodCardPressed: {
    opacity: 0.85,
  },
  moodCardSelected: {
    borderWidth: 3,
  },
  moodCardDimmed: {
    opacity: 0.45,
  },
  moodCardCheck: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    zIndex: 1,
  },
  moodCardCheckGlyph: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.white,
  },
  moodCardClip: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  miliHappyImage: {
    width: 84,
    height: 91,
    marginTop: 6,
  },
  miloSadImage: {
    width: 80,
    height: 85,
    marginTop: 12,
  },
  moodCardText: {
    width: '100%',
    marginTop: 14,
  },
  moodLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12.5,
  },
  moodSubtitle: {
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    color: colors.body,
    marginTop: 4,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    marginTop: 14,
    textAlign: 'center',
  },
});

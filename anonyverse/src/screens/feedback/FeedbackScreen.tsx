import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  type ImageSourcePropType,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { MascotPair } from '../../components/MascotPair/MascotPair';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { colors, fontFamily, radii, spacing, typography } from '../../design/tokens';
import { useCrossfade } from '../../hooks/useCrossfade';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import { restFeedbackService } from '../../services/feedback/restFeedbackService';
import { FEEDBACK_MESSAGE_MAX_LENGTH, type FeedbackType } from '../../services/feedback/types';
import { tokenProvider as defaultTokenProvider, type TokenProvider } from '../../services/session/tokenProvider';
import {
  FEEDBACK_ERROR_MESSAGES,
  type FeedbackDefaults,
  useFeedbackController,
} from './useFeedbackController';

const miliHappy = require('../../assets/images/mili-happy.png');
const miliChecking = require('../../assets/images/mili-checking.png');
const miliExcited = require('../../assets/images/mili-excited.png');
const miliLookingOut = require('../../assets/images/mili-looking-out.png');
const miloProud = require('../../assets/images/milo-proud.png');
const miloWaiting = require('../../assets/images/milo-waiting.png');
const miloExcited = require('../../assets/images/milo-excited.png');

interface MascotMood {
  /** What Mili & Milo say, and how they look, in this mood. */
  bubble: string;
  mili: ImageSourcePropType;
  milo: ImageSourcePropType;
}

interface TypeOption extends MascotMood {
  value: FeedbackType;
  label: string;
  hint: string;
  placeholder: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    value: 'GENERAL',
    label: 'General',
    hint: 'Anything on your mind',
    placeholder: 'Tell us what you think...',
    bubble: "We're all ears!",
    mili: miliHappy,
    milo: miloProud,
  },
  {
    value: 'BUG',
    label: 'Bug',
    hint: "Something's broken",
    placeholder: 'What happened, and what were you trying to do?',
    bubble: 'Uh oh, what broke?',
    mili: miliChecking,
    milo: miloWaiting,
  },
  {
    value: 'FEATURE_REQUEST',
    label: 'Feature idea',
    hint: 'Something new',
    placeholder: 'What would you love Anonyverse to do?',
    bubble: 'Ooh, tell us more!',
    mili: miliExcited,
    milo: miloExcited,
  },
  {
    value: 'IMPROVEMENT',
    label: 'Improvement',
    hint: 'Make it better',
    placeholder: 'What could work better, and how?',
    bubble: 'How can we do better?',
    mili: miliLookingOut,
    milo: miloProud,
  },
];

type RatingMoodKey = 'none' | 'low' | 'mid' | 'high';

const RATING_MOODS: Record<RatingMoodKey, MascotMood> = {
  none: { bubble: 'How are we doing?', mili: miliHappy, milo: miloProud },
  low: { bubble: "Oh no, we'll do better", mili: miliChecking, milo: miloWaiting },
  mid: { bubble: "Thanks, we'll keep improving", mili: miliLookingOut, milo: miloProud },
  high: { bubble: 'Yay, thank you!', mili: miliExcited, milo: miloExcited },
};

function ratingMoodKey(rating: number | null): RatingMoodKey {
  if (rating === null) {
    return 'none';
  }
  if (rating <= 2) {
    return 'low';
  }
  return rating === 3 ? 'mid' : 'high';
}

const RATING_LABELS = ['Not great', 'Could be better', "It's okay", 'Pretty good', 'Love it!'];

type Step = 'message' | 'rating';

const SLIDE_DURATION_MS = 320;
/** Below this window height the mascots shrink and secondary copy is dropped so step 1 fits without scrolling. */
const COMPACT_HEIGHT = 720;

const MASCOT_PAIR_WIDTH = 240;
const MASCOT_PAIR_HEIGHT = 140;
const MASCOT_LEFT_LAYOUT = { left: 0, top: 6, width: 124, height: 128 };
const MASCOT_RIGHT_LAYOUT = { left: 116, top: 0, width: 124, height: 134 };
const MASCOT_GLOW = {
  colors: ['rgba(242,165,224,0.4)', 'rgba(242,165,224,0)'] as const,
  opacity: 0.81,
};
const SUCCESS_GLOW = {
  colors: ['rgba(34,122,74,0.16)', 'rgba(34,122,74,0)'] as const,
  opacity: 1,
};

function scaleLayout(
  layout: { left: number; top: number; width: number; height: number },
  scale: number,
) {
  return {
    left: layout.left * scale,
    top: layout.top * scale,
    width: layout.width * scale,
    height: layout.height * scale,
  };
}

interface MascotHeroProps {
  mood: MascotMood;
  opacity: Animated.Value;
  scale: number;
  glow?: typeof MASCOT_GLOW | typeof SUCCESS_GLOW;
  bubbleTextStyle?: object;
}

/** Mili & Milo with a speech bubble above them. */
function MascotHero({ mood, opacity, scale, glow = MASCOT_GLOW, bubbleTextStyle }: MascotHeroProps) {
  return (
    <Animated.View style={[styles.hero, { opacity }]}>
      <View style={styles.bubble}>
        <Text style={[styles.bubbleText, bubbleTextStyle]}>{mood.bubble}</Text>
      </View>
      <View style={styles.bubbleTail} />
      <MascotPair
        height={MASCOT_PAIR_HEIGHT * scale}
        pairWidth={MASCOT_PAIR_WIDTH * scale}
        leftImage={mood.mili}
        rightImage={mood.milo}
        leftLayout={scaleLayout(MASCOT_LEFT_LAYOUT, scale)}
        rightLayout={scaleLayout(MASCOT_RIGHT_LAYOUT, scale)}
        glow={glow}
      />
    </Animated.View>
  );
}

const STAR_SIZE = 40;
const STAR_POP_STAGGER_MS = 45;
const STAR_OUTLINE = 'rgba(50, 21, 101, 0.28)';
const STAR_PATH =
  'M12 2.6l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.41l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.6z';

interface StarButtonProps {
  value: number;
  filled: boolean;
  selected: boolean;
  /** Whether this star was the one just tapped. */
  tapped: boolean;
  /** Changes on every star tap; a change replays the pop. */
  popToken: number;
  onPress: () => void;
}

/**
 * One rating star. On each tap, every filled star pops in sequence from the
 * left (scale + wiggle + a fading ring), so choosing 4 stars ripples across
 * stars 1-4. When a tap clears the rating, only the tapped star bounces.
 */
function StarButton({ value, filled, selected, tapped, popToken, onPress }: StarButtonProps) {
  const pop = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Reset first: a quick second tap stops this star's pop mid-flight, and a
    // star that isn't popping again would otherwise stay enlarged and tilted.
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

export interface FeedbackScreenProps {
  defaults?: FeedbackDefaults;
  onClose: () => void;
  tokenProvider?: TokenProvider;
  feedbackService?: FeedbackService;
}

export function FeedbackScreen({
  defaults = {},
  onClose,
  tokenProvider = defaultTokenProvider,
  feedbackService = restFeedbackService,
}: FeedbackScreenProps) {
  const {
    phase,
    type,
    message,
    rating,
    messageLength,
    isMessageTooLong,
    canSubmit,
    error,
    setType,
    setMessage,
    toggleRating,
    submit,
  } = useFeedbackController(defaults, tokenProvider, feedbackService);

  const { width, height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const mascotScale = compact ? 0.75 : 1;
  const keyboardVisible = useKeyboardState(state => state.isVisible);

  const [step, setStep] = useState<Step>('message');
  // Bumped on every star tap so the stars know to replay their pop.
  const [starTap, setStarTap] = useState({ value: 0, token: 0 });
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: step === 'message' ? 0 : 1,
      duration: SLIDE_DURATION_MS,
      useNativeDriver: true,
    }).start();
  }, [step, slide]);

  // Android's back button should step back to the message, not close the
  // screen and throw away what the user typed.
  useEffect(() => {
    if (step !== 'rating' || phase === 'submitted') {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('message');
      return true;
    });
    return () => subscription.remove();
  }, [step, phase]);

  const goToRating = () => {
    Keyboard.dismiss();
    setStep('rating');
  };

  const selectedOption = TYPE_OPTIONS.find(option => option.value === type) ?? TYPE_OPTIONS[0];
  // Mili & Milo change pose with the selected type / rating; fade rather than cut.
  const typeFade = useCrossfade(type);
  const typeMood = TYPE_OPTIONS.find(option => option.value === typeFade.displayValue) ?? TYPE_OPTIONS[0];
  const ratingFade = useCrossfade(ratingMoodKey(rating));
  const ratingMood = RATING_MOODS[ratingFade.displayValue];

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [0, -width] });
  const pageHidden = (page: Step) =>
    step !== page
      ? ({
          pointerEvents: 'none',
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants',
        } as const)
      : ({ pointerEvents: 'auto' } as const);

  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          {phase !== 'submitted' && step === 'rating' ? (
            <Pressable
              onPress={() => setStep('message')}
              accessibilityRole="button"
              accessibilityLabel="Back to message"
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Text style={styles.headerGlyph}>{'←'}</Text>
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}

          {phase !== 'submitted' ? (
            <View style={styles.stepDots} accessible accessibilityLabel={`Step ${step === 'message' ? 1 : 2} of 2`}>
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <View style={[styles.stepDot, step === 'rating' && styles.stepDotActive]} />
            </View>
          ) : null}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close feedback"
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Text style={styles.headerGlyph}>{'×'}</Text>
          </Pressable>
        </View>

        {phase === 'submitted' ? (
          <View style={styles.successContent}>
            <Text style={[typography.headline, styles.centered]}>Thanks for your feedback!</Text>
            <MascotHero
              mood={{ bubble: 'Got it, thank you!', mili: miliExcited, milo: miloProud }}
              opacity={typeFade.opacity}
              scale={1}
              glow={SUCCESS_GLOW}
              bubbleTextStyle={styles.bubbleTextSuccess}
            />
            <Text style={[typography.bodyCentered, styles.centered]}>
              {'Mili & Milo have passed it on to the team.\nIt really helps us make Anonyverse better.'}
            </Text>
            <View style={styles.successButton}>
              <PrimaryButton variant="action" label="Back" onPress={onClose} />
            </View>
          </View>
        ) : (
          <KeyboardAvoidingView behavior="padding" style={styles.viewport}>
            <Animated.View
              style={[styles.track, { width: width * 2, transform: [{ translateX }] }]}
            >
              {/* Step 1: what the feedback is about + the message. */}
              <View style={[styles.page, { width }]} {...pageHidden('message')}>
                <Text style={[typography.headline, styles.centered]}>Send feedback</Text>
                {!compact && !keyboardVisible ? (
                  <Text style={[typography.bodyCentered, styles.subtext]}>
                    {"Tell us what's working, what's broken,\nor what you'd like to see."}
                  </Text>
                ) : null}

                {!keyboardVisible ? (
                  <MascotHero mood={typeMood} opacity={typeFade.opacity} scale={mascotScale} />
                ) : null}

                <View style={[styles.card, styles.messageCard]}>
                  <View style={styles.typeGrid}>
                    {TYPE_OPTIONS.map(option => {
                      const selected = option.value === type;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => setType(option.value)}
                          accessibilityRole="radio"
                          accessibilityLabel={option.label}
                          accessibilityState={{ selected }}
                          style={({ pressed }) => [
                            styles.typeTile,
                            selected && styles.typeTileSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>
                            {option.label}
                          </Text>
                          {!compact ? <Text style={styles.typeHint}>{option.hint}</Text> : null}
                        </Pressable>
                      );
                    })}
                  </View>

                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder={selectedOption.placeholder}
                    placeholderTextColor={colors.inkMuted}
                    style={[styles.input, isMessageTooLong && styles.inputError]}
                    multiline
                    textAlignVertical="top"
                    accessibilityLabel="Feedback message"
                    editable={phase === 'editing'}
                  />
                  <Text style={[styles.counter, isMessageTooLong && styles.counterError]}>
                    {`${messageLength}/${FEEDBACK_MESSAGE_MAX_LENGTH}`}
                  </Text>
                </View>

                <View style={styles.pageButton}>
                  {canSubmit ? (
                    <PrimaryButton variant="action" label="Next" onPress={goToRating} />
                  ) : (
                    <PrimaryButton variant="disabled" solid label="Next" />
                  )}
                </View>
              </View>

              {/* Step 2: optional overall rating, then submit. */}
              <View style={[styles.page, { width }]} {...pageHidden('rating')}>
                <Text style={[typography.headline, styles.centered]}>Rate us</Text>
                <Text style={[typography.bodyCentered, styles.subtext]}>
                  How's Anonyverse overall?
                </Text>

                <MascotHero mood={ratingMood} opacity={ratingFade.opacity} scale={mascotScale} />

                <View style={styles.card}>
                  <View style={styles.ratingRow}>
                    {RATING_LABELS.map((_, index) => {
                      const value = index + 1;
                      const filled = rating !== null && value <= rating;
                      return (
                        <StarButton
                          key={value}
                          value={value}
                          filled={filled}
                          selected={rating === value}
                          tapped={starTap.value === value}
                          popToken={starTap.token}
                          onPress={() => {
                            toggleRating(value);
                            setStarTap(current => ({ value, token: current.token + 1 }));
                          }}
                        />
                      );
                    })}
                  </View>
                  <Text style={styles.ratingCaption}>
                    {rating === null ? 'Tap a star to rate' : RATING_LABELS[rating - 1]}
                  </Text>
                </View>

                {error ? (
                  <Text style={styles.errorText} accessibilityLiveRegion="polite">
                    {FEEDBACK_ERROR_MESSAGES[error]}
                  </Text>
                ) : null}

                <View style={styles.flexSpacer} />

                <View style={styles.pageButton}>
                  {phase === 'submitting' ? (
                    <PrimaryButton variant="loading" label="Sending..." />
                  ) : canSubmit ? (
                    <PrimaryButton variant="action" label="Send feedback" onPress={submit} />
                  ) : (
                    <PrimaryButton variant="disabled" solid label="Send feedback" />
                  )}
                </View>
                <Text style={styles.footnote}>
                  Rating is optional. Your feedback stays anonymous.
                </Text>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayBackground,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  headerGlyph: {
    fontFamily: fontFamily.semiBold,
    fontSize: 19,
    color: colors.ink,
  },
  stepDots: {
    flexDirection: 'row',
    gap: 6,
  },
  stepDot: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.progressTrackInactive,
  },
  stepDotActive: {
    backgroundColor: colors.accentPink,
  },
  pressed: {
    opacity: 0.85,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  track: {
    flex: 1,
    flexDirection: 'row',
  },
  page: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  subtext: {
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  bubble: {
    alignSelf: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 18,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  bubbleTail: {
    width: 12,
    height: 12,
    marginTop: -6,
    backgroundColor: colors.white,
    transform: [{ rotate: '45deg' }],
  },
  bubbleText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.moodGoodLabel,
  },
  bubbleTextSuccess: {
    color: colors.success,
  },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.statusCardBackground,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 4,
  },
  messageCard: {
    // Takes whatever height is left so the message box grows to fill the screen.
    flex: 1,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeTile: {
    flexGrow: 1,
    flexBasis: '45%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.progressTrackInactive,
  },
  typeTileSelected: {
    backgroundColor: colors.moodGoodChipSelected,
    borderColor: colors.accentPink,
  },
  typeLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.body,
  },
  typeLabelSelected: {
    color: colors.ink,
  },
  typeHint: {
    ...typography.caption,
    marginTop: 2,
    color: colors.inkMuted,
  },
  input: {
    flex: 1,
    minHeight: 80,
    marginTop: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    fontFamily: typography.bubble.fontFamily,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    borderWidth: 1.5,
    borderColor: colors.progressTrackInactive,
  },
  inputError: {
    borderColor: colors.warning,
  },
  counter: {
    ...typography.caption,
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
    color: colors.inkMuted,
  },
  counterError: {
    color: colors.warning,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
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
  ratingCaption: {
    ...typography.caption,
    marginTop: 12,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    color: colors.moodGoodLabel,
  },
  errorText: {
    ...typography.caption,
    marginTop: spacing.md,
    color: colors.danger,
    textAlign: 'center',
  },
  flexSpacer: {
    flex: 1,
  },
  pageButton: {
    marginTop: spacing.md,
  },
  footnote: {
    ...typography.caption,
    marginTop: 12,
    textAlign: 'center',
    color: colors.inkMuted,
  },
  successContent: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screenHorizontal,
  },
  centered: {
    textAlign: 'center',
  },
  successButton: {
    marginTop: spacing.md,
  },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MascotPair } from '../../components/MascotPair/MascotPair';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { colors, fontFamily, radii, typography } from '../../design/tokens';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import { restFeedbackService } from '../../services/feedback/restFeedbackService';
import { FEEDBACK_MESSAGE_MAX_LENGTH } from '../../services/feedback/types';
import { useCrossfade } from '../../hooks/useCrossfade';
import { tokenProvider as defaultTokenProvider, type TokenProvider } from '../../services/session/tokenProvider';
import { REASON_LABELS } from './feedbackOptions';
import { StarButton } from './StarButton';
import {
  FEEDBACK_ERROR_MESSAGES,
  type FeedbackDefaults,
  useFeedbackController,
} from './useFeedbackController';

const miliHappy = require('../../assets/images/mili-happy.png');
const miliExcited = require('../../assets/images/mili-excited.png');
const miliChecking = require('../../assets/images/mili-checking.png');
const miliLookingOut = require('../../assets/images/mili-looking-out.png');
const miloProud = require('../../assets/images/milo-proud.png');
const miloWaiting = require('../../assets/images/milo-waiting.png');
const miloExcited = require('../../assets/images/milo-excited.png');

type RatingMood = 'none' | 'low' | 'mid' | 'high';

const RATING_MASCOTS: Record<RatingMood, { mili: number; milo: number }> = {
  none: { mili: miliHappy, milo: miloProud },
  low: { mili: miliChecking, milo: miloWaiting },
  mid: { mili: miliLookingOut, milo: miloProud },
  high: { mili: miliExcited, milo: miloExcited },
};

function ratingMood(rating: number | null): RatingMood {
  if (rating === null) {
    return 'none';
  }
  if (rating <= 2) {
    return 'low';
  }
  return rating === 3 ? 'mid' : 'high';
}

const RATING_LABELS = ['Not great', 'Could be better', "It's okay", 'Pretty good', 'Love it!'];

const SWIPE_START_DISTANCE = 8;
const SWIPE_CLOSE_DISTANCE = 110;
const SWIPE_CLOSE_VELOCITY = 0.9;

export interface FeedbackSheetProps {
  defaults?: FeedbackDefaults;
  /** Called after the close animation; `submitted` is whether feedback was sent. */
  onClose: (submitted: boolean) => void;
  tokenProvider?: TokenProvider;
  feedbackService?: FeedbackService;
}

export function FeedbackSheet({
  defaults = {},
  onClose,
  tokenProvider = defaultTokenProvider,
  feedbackService = restFeedbackService,
}: FeedbackSheetProps) {
  const controller = useFeedbackController(defaults, tokenProvider, feedbackService);
  const { step, submitting } = controller;

  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(windowHeight)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scrimOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 60 }),
    ]).start();
  }, [scrimOpacity, translateY]);

  const handleClose = useCallback(() => {
    if (submitting || closingRef.current) {
      return;
    }
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(scrimOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: windowHeight, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose(step === 'submitted'));
  }, [submitting, step, scrimOpacity, translateY, windowHeight, onClose]);

  // Swipe down to close, only while scrolled to the top so scrolling still works.
  const scrollOffsetRef = useRef(0);
  const dragStateRef = useRef({ submitting, handleClose });
  dragStateRef.current = { submitting, handleClose };
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
        !dragStateRef.current.submitting &&
        !closingRef.current &&
        scrollOffsetRef.current <= 0 &&
        gesture.dy > SWIPE_START_DISTANCE &&
        gesture.dy > Math.abs(gesture.dx) * 1.2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_evt, gesture) => {
        translateY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > SWIPE_CLOSE_DISTANCE || gesture.vy > SWIPE_CLOSE_VELOCITY) {
          dragStateRef.current.handleClose();
          return;
        }
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 80 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 80 }).start();
      },
    }),
  ).current;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => subscription.remove();
  }, [handleClose]);

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrimOpacity }]}>
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="light"
          blurAmount={4}
          reducedTransparencyFallbackColor={colors.gradientBackground[0]}
        />
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close feedback"
        />
      </Animated.View>

      <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoider} pointerEvents="box-none">
        <Animated.View
          style={[styles.sheet, { marginTop: insets.top + 24, transform: [{ translateY }] }]}
          accessibilityViewIsModal
          {...panResponder.panHandlers}
        >
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={event => {
              scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
            }}
            contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 22) + 8 }]}
          >
            <View style={styles.handle} />
            {step === 'question' ? (
              <QuestionStep onAnswer={controller.answerSomethingWrong} />
            ) : step === 'submitted' ? (
              <SubmittedStep onDone={handleClose} />
            ) : (
              <AnswerStep controller={controller} />
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SheetMascots({ mili, milo = miloProud }: { mili: number; milo?: number }) {
  return (
    <MascotPair
      height={92}
      pairWidth={160}
      leftImage={mili}
      rightImage={milo}
      leftLayout={{ left: 0, top: 8, width: 82, height: 84 }}
      rightLayout={{ left: 78, top: 8, width: 82, height: 90 }}
      glow={{ colors: ['rgba(242,165,224,0.4)', 'rgba(242,165,224,0)'], opacity: 0.81 }}
    />
  );
}

function QuestionStep({ onAnswer }: { onAnswer: (wentWrong: boolean) => void }) {
  return (
    <View style={styles.centeredStep}>
      <Text style={[styles.title, styles.centeredText]} accessibilityRole="header">
        How was your experience?
      </Text>
      <SheetMascots mili={miliHappy} />
      <Text style={[styles.subtitle, styles.centeredText]}>Two taps, and Mili & Milo pass it on.</Text>

      <View style={styles.answerButtons}>
        <Pressable
          onPress={() => onAnswer(false)}
          accessibilityRole="button"
          accessibilityLabel="Good"
          style={({ pressed }) => [styles.answerButton, styles.answerButtonGood, pressed && styles.pressed]}
        >
          <Text style={[styles.answerLabel, styles.answerLabelGood]}>Good</Text>
        </Pressable>
        <Pressable
          onPress={() => onAnswer(true)}
          accessibilityRole="button"
          accessibilityLabel="Bad"
          style={({ pressed }) => [styles.answerButton, styles.answerButtonBad, pressed && styles.pressed]}
        >
          <Text style={styles.answerLabel}>Bad</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SubmittedStep({ onDone }: { onDone: () => void }) {
  return (
    <View style={styles.centeredStep}>
      <Text style={[styles.title, styles.centeredText]} accessibilityRole="header">
        Thanks for your feedback!
      </Text>
      <SheetMascots mili={miliExcited} />
      <Text style={[styles.subtitle, styles.centeredText]}>
        Mili & Milo have passed it on to the team.
      </Text>
      <View style={styles.sendButton}>
        <PrimaryButton variant="action" label="Done" onPress={onDone} />
      </View>
    </View>
  );
}

function AnswerStep({ controller }: { controller: ReturnType<typeof useFeedbackController> }) {
  const {
    step,
    rating,
    reasons,
    reasonOptions,
    followUpQuestion,
    message,
    messageLength,
    isMessageTooLong,
    canSubmit,
    submitting,
    error,
    setRating,
    toggleReason,
    setMessage,
    submit,
  } = controller;
  const [starTap, setStarTap] = useState({ value: 0, token: 0 });
  const isBug = step === 'bug';
  const showOptions = isBug || rating !== null;

  const mascotFade = useCrossfade(ratingMood(rating));
  const mascots = RATING_MASCOTS[mascotFade.displayValue];

  return (
    <View>
      {isBug ? (
        <>
          <Text style={[styles.title, styles.stepTitle]} accessibilityRole="header">
            What went wrong?
          </Text>
          <Text style={styles.subtitle}>Pick everything that happened.</Text>
        </>
      ) : (
        <>
          <Text style={[styles.title, styles.centeredText, styles.ratingTitle]} accessibilityRole="header">
            {followUpQuestion ?? 'Rate us'}
          </Text>
          <Animated.View style={[styles.ratingMascots, { opacity: mascotFade.opacity }]}>
            <SheetMascots mili={mascots.mili} milo={mascots.milo} />
          </Animated.View>
          <View style={styles.ratingRow}>
            {RATING_LABELS.map((_, index) => {
              const value = index + 1;
              return (
                <StarButton
                  key={value}
                  value={value}
                  filled={rating !== null && value <= rating}
                  selected={rating === value}
                  tapped={starTap.value === value}
                  popToken={starTap.token}
                  onPress={() => {
                    setRating(value);
                    setStarTap(current => ({ value, token: current.token + 1 }));
                  }}
                />
              );
            })}
          </View>
          {rating !== null ? <Text style={styles.ratingCaption}>{RATING_LABELS[rating - 1]}</Text> : null}
        </>
      )}

      {showOptions ? (
        <>
          <View style={[styles.chips, !isBug && styles.ratingChips]}>
            {reasonOptions.map(reason => {
              const selected = reasons.includes(reason);
              return (
                <Pressable
                  key={reason}
                  onPress={() => toggleReason(reason)}
                  disabled={submitting}
                  accessibilityRole="checkbox"
                  accessibilityLabel={REASON_LABELS[reason]}
                  accessibilityState={{ checked: selected, disabled: submitting }}
                  style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                    {REASON_LABELS[reason]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Anything else? (optional)"
            placeholderTextColor={colors.inkMuted}
            style={[styles.messageInput, isMessageTooLong && styles.messageInputError]}
            multiline
            editable={!submitting}
            textAlignVertical="top"
            accessibilityLabel="Feedback message"
          />
          {messageLength > FEEDBACK_MESSAGE_MAX_LENGTH * 0.9 ? (
            <Text style={[styles.counter, isMessageTooLong && styles.counterError]}>
              {`${messageLength}/${FEEDBACK_MESSAGE_MAX_LENGTH}`}
            </Text>
          ) : null}
        </>
      ) : null}

      {error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {FEEDBACK_ERROR_MESSAGES[error]}
        </Text>
      ) : null}

      <View style={styles.sendButton}>
        {submitting ? (
          <PrimaryButton variant="loading" label="Sending..." />
        ) : canSubmit ? (
          <PrimaryButton variant="action" label="Send feedback" onPress={submit} />
        ) : (
          <PrimaryButton variant="disabled" solid label="Send feedback" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  scrim: {
    backgroundColor: colors.sheetScrim,
  },
  keyboardAvoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    shadowColor: colors.sheetShadow,
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingTop: 26,
  },
  handle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.progressTrackInactive,
  },
  centeredStep: {
    alignItems: 'stretch',
    marginTop: 12,
  },
  centeredText: {
    textAlign: 'center',
  },
  stepTitle: {
    marginTop: 18,
  },
  title: {
    flexShrink: 1,
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.ink,
    padding: 8
  },
  subtitle: {
    marginTop: 10,
    fontFamily: fontFamily.regular,
    fontSize: 14.5,
    lineHeight: 21.75,
    color: colors.body,
  },
  answerButtons: {
    marginTop: 22,
    gap: 11,
  },
  answerButton: {
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerButtonGood: {
    borderColor: colors.accentPink,
    backgroundColor: colors.moodGoodChipSelected,
  },
  answerButtonBad: {
    borderColor: 'transparent',
    backgroundColor: colors.softChipBackground,
  },
  answerLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.softChipText,
  },
  answerLabelGood: {
    color: colors.moodGoodLabel,
  },
  ratingTitle: {
    marginTop: 18,
  },
  ratingMascots: {
    marginTop: 12,
  },
  ratingChips: {
    marginTop: 26,
  },
  ratingRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ratingCaption: {
    ...typography.caption,
    marginTop: 10,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    color: colors.moodGoodLabel,
  },
  chips: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chip: {
    minHeight: 45,
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    backgroundColor: colors.softChipBackground,
  },
  chipSelected: {
    borderColor: colors.accentPink,
    backgroundColor: colors.moodGoodChipSelected,
  },
  chipLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 13.5,
    color: colors.softChipText,
  },
  chipLabelSelected: {
    color: colors.moodGoodLabel,
  },
  messageInput: {
    marginTop: 18,
    minHeight: 80,
    maxHeight: 140,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.softChipBackground,
    fontFamily: typography.bubble.fontFamily,
    fontSize: 14,
    color: colors.ink,
  },
  messageInputError: {
    borderColor: colors.warning,
  },
  counter: {
    ...typography.caption,
    alignSelf: 'flex-end',
    marginTop: 4,
    color: colors.inkMuted,
  },
  counterError: {
    color: colors.warning,
  },
  errorText: {
    ...typography.caption,
    marginTop: 14,
    color: colors.danger,
    textAlign: 'center',
  },
  sendButton: {
    marginTop: 24,
  },
  pressed: {
    opacity: 0.85,
  },
});

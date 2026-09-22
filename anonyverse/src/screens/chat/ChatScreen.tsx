import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  LayoutAnimation,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { colors, fontFamily, radii, spacing, typography } from '../../design/tokens';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';
import type { Mood } from '../moodSelect/MoodSelectScreen';
import { useChatController, type ChatMessage } from './useChatController';
import { FindingNewMatchModal } from './FindingNewMatchModal';

const miliHappy = require('../../assets/images/mili-happy.png');
const INTRO_CARD_GAP = 12;

export interface ChatScreenProps {
  chatSocketService: ChatSocketService;
  mood: Mood;
  topic: string | null;
  onLeave: () => void;
}

export function ChatScreen({ chatSocketService, mood, topic, onLeave }: ChatScreenProps) {
  const {
    messages,
    inputValue,
    setInputValue,
    introDismissed,
    handleDismissIntro,
    handleSend,
    skipSecondsRemaining,
    canSkip,
    partnerTyping,
    replyingTo,
    handleReply,
    handleCancelReply,
    rematchState,
    skipUnavailableMessage,
    handleSkip,
    handleStopSearching,
  } = useChatController(chatSocketService, onLeave);
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 12);
  const keyboardGap = 8;
  const keyboardHeight = useKeyboardState(state => (state.isVisible ? state.height : 0));
  const [inputBarHeight, setInputBarHeight] = useState(0);
  const [introCardHeight, setIntroCardHeight] = useState(0);
  const sendButtonScale = useRef(new Animated.Value(1)).current;

  const handleReport = () => {
    console.log('[Chat] Report tapped — not implemented yet.');
  };

  const handleDismissIntroCard = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    handleDismissIntro();
  };

  const handleSendPressIn = () => {
    Animated.spring(sendButtonScale, { toValue: 0.88, useNativeDriver: true, friction: 5, tension: 100 }).start();
  };

  const handleSendPressOut = () => {
    Animated.spring(sendButtonScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 100 }).start();
  };

  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={handleSkip}
            disabled={!canSkip}
            accessibilityRole="button"
            accessibilityLabel={canSkip ? 'Skip this conversation' : `Skip available in ${skipSecondsRemaining}s`}
            accessibilityState={{ disabled: !canSkip }}
            style={({ pressed }) => [
              styles.skipButton,
              !canSkip && styles.skipButtonDisabled,
              pressed && canSkip && styles.pressed,
            ]}
          >
            <Text style={styles.skipLabel}>{canSkip ? 'Skip' : `Skip · ${skipSecondsRemaining}s`}</Text>
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.strangerLabel}>STRANGER</Text>
          </View>

          <Pressable
            onPress={handleReport}
            accessibilityRole="button"
            accessibilityLabel="Report this user"
            style={({ pressed }) => [styles.reportButton, pressed && styles.pressed]}
          >
            <Text style={styles.reportGlyph}>{'⚑'}</Text>
          </Pressable>
        </View>

        <View style={styles.threadArea}>
          <ScrollView
            ref={scrollRef}
            style={styles.thread}
            contentContainerStyle={[
              styles.threadContent,
              {
                paddingTop: 8 + (!introDismissed ? introCardHeight + INTRO_CARD_GAP : 0),
                paddingBottom: 16 + inputBarHeight + keyboardHeight,
              },
            ]}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map(message => (
              <MessageBubble key={message.id} message={message} onReply={handleReply} />
            ))}

            {partnerTyping ? <TypingBubble /> : null}
          </ScrollView>

          {!introDismissed ? (
            <View
              style={styles.introCardWrap}
              pointerEvents="box-none"
              onLayout={event => setIntroCardHeight(event.nativeEvent.layout.height)}
            >
              <IntroCard onDismiss={handleDismissIntroCard} />
            </View>
          ) : null}
        </View>

        <KeyboardStickyView
          style={[styles.inputBar, { paddingBottom: bottomInset }]}
          offset={{ closed: 0, opened: bottomInset - keyboardGap }}
          onLayout={event => setInputBarHeight(event.nativeEvent.layout.height)}
        >
          {replyingTo ? (
            <View style={styles.replyComposer}>
              <View style={styles.replyComposerBar} />
              <View style={styles.replyComposerTextColumn}>
                <Text style={styles.replyComposerSender}>
                  Replying to {replyingTo.sender === 'me' ? 'yourself' : 'Stranger'}
                </Text>
                <Text style={styles.replyComposerText} numberOfLines={1}>
                  {replyingTo.text}
                </Text>
              </View>
              <Pressable
                onPress={handleCancelReply}
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                hitSlop={8}
              >
                <Text style={styles.replyComposerClose}>{'✕'}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="Say something..."
              placeholderTextColor={colors.inkMuted}
              style={styles.input}
              multiline
              textAlignVertical="center"
              onSubmitEditing={handleSend}
            />
            <Pressable
              onPress={handleSend}
              onPressIn={handleSendPressIn}
              onPressOut={handleSendPressOut}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}
            >
              <Animated.View style={{ transform: [{ scale: sendButtonScale }] }}>
                <Text style={styles.sendGlyph}>{'↑'}</Text>
              </Animated.View>
            </Pressable>
          </View>
        </KeyboardStickyView>
      </SafeAreaView>

      {skipUnavailableMessage ? (
        <View style={styles.unavailableToastWrap} pointerEvents="none">
          <View style={styles.unavailableToast}>
            <Text style={styles.unavailableToastText}>{skipUnavailableMessage}</Text>
          </View>
        </View>
      ) : null}

      {rematchState === 'rematching' ? (
        <FindingNewMatchModal
          mood={mood}
          topic={topic}
          onStopSearching={handleStopSearching}
          onReport={handleReport}
        />
      ) : null}
    </View>
  );
}

function IntroCard({ onDismiss }: { onDismiss: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const height = useRef(new Animated.Value(0)).current;
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    if (measuredHeight === null) {
      const nextHeight = event.nativeEvent.layout.height;
      setMeasuredHeight(nextHeight);
      height.setValue(nextHeight);
    }
  };

  const handleDismiss = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.92, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(height, { toValue: 0, duration: 220, useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (finished) {
        onDismiss();
      }
    });
  };

  return (
    <Animated.View
      style={measuredHeight === null ? undefined : { height, overflow: 'hidden' }}
      onLayout={handleContainerLayout}
    >
      <Animated.View style={[styles.introCard, { opacity, transform: [{ scale }] }]}>
        <View style={styles.introHeader}>
          <Image source={miliHappy} resizeMode="contain" style={styles.introMascot} />
          <Text style={styles.introTitle}>{'Three things before\nyou start'}</Text>
        </View>
        {[
          "Treat them like someone you'd want to meet again.",
          'No slurs, no harassment, nothing sexual.',
          'Never share your real name or details.',
        ].map(rule => (
          <View key={rule} style={styles.introRow}>
            <Text style={styles.introCheck}>{'✓'}</Text>
            <Text style={styles.introRuleText}>{rule}</Text>
          </View>
        ))}
        <Pressable
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Got it, let's talk"
          style={({ pressed }) => [styles.introButton, pressed && styles.pressed]}
        >
          <Text style={styles.introButtonLabel}>Got it — let's talk</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function TypingBubble() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(450 - delay),
        ]),
      );

    const animations = [bounce(dot1, 0), bounce(dot2, 150), bounce(dot3, 300)];
    animations.forEach(animation => animation.start());
    return () => animations.forEach(animation => animation.stop());
  }, [dot1, dot2, dot3]);

  const dotStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  });

  return (
    <View style={[styles.bubbleRow, styles.bubbleRowPartner]}>
      <View style={[styles.bubble, styles.bubblePartner, styles.typingBubble]}>
        <Animated.View style={[styles.typingDot, dotStyle(dot1)]} />
        <Animated.View style={[styles.typingDot, dotStyle(dot2)]} />
        <Animated.View style={[styles.typingDot, dotStyle(dot3)]} />
      </View>
    </View>
  );
}

function SystemPill({ text }: { text: string }) {
  return (
    <View style={styles.systemPillWrap}>
      <View style={styles.systemPill}>
        <Text style={styles.systemPillText}>{text}</Text>
      </View>
    </View>
  );
}

const REPLY_SWIPE_TRIGGER = 56;
const REPLY_SWIPE_MAX = 88;

function MessageBubble({ message, onReply }: { message: ChatMessage; onReply: (message: ChatMessage) => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const enterOpacity = useRef(new Animated.Value(0)).current;
  const enterTranslateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(enterTranslateY, { toValue: 0, useNativeDriver: true, friction: 7, tension: 70 }),
    ]).start();
  }, [enterOpacity, enterTranslateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_evt, gesture) => {
        const clamped = Math.max(-REPLY_SWIPE_MAX, Math.min(REPLY_SWIPE_MAX, gesture.dx));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_evt, gesture) => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 60 }).start();
        if (Math.abs(gesture.dx) > REPLY_SWIPE_TRIGGER) {
          onReply(message);
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 60 }).start();
      },
    }),
  ).current;

  if (message.sender === 'system') {
    return <SystemPill text={message.text} />;
  }

  const isMe = message.sender === 'me';
  const leftIconOpacity = translateX.interpolate({
    inputRange: [0, REPLY_SWIPE_TRIGGER],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const rightIconOpacity = translateX.interpolate({
    inputRange: [-REPLY_SWIPE_TRIGGER, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowPartner]}>
      <Animated.View pointerEvents="none" style={[styles.replyIcon, styles.replyIconLeft, { opacity: leftIconOpacity }]}>
        <Text style={styles.replyIconGlyph}>{'↩'}</Text>
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubblePartner,
          { opacity: enterOpacity, transform: [{ translateX }, { translateY: enterTranslateY }] },
        ]}
      >
        {message.replyTo ? (
          <View style={[styles.replyPreview, isMe ? styles.replyPreviewMe : styles.replyPreviewPartner]}>
            <Text style={[styles.replyPreviewSender, isMe ? styles.replyPreviewSenderMe : styles.replyPreviewSenderPartner]}>
              {message.replyTo.sender === 'me' ? 'You' : 'Stranger'}
            </Text>
            <Text
              style={[styles.replyPreviewText, isMe ? styles.replyPreviewTextMe : styles.replyPreviewTextPartner]}
              numberOfLines={1}
            >
              {message.replyTo.text}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextPartner]}>
          {message.text}
        </Text>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.replyIcon, styles.replyIconRight, { opacity: rightIconOpacity }]}>
        <Text style={styles.replyIconGlyph}>{'↩'}</Text>
      </Animated.View>
    </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 12,
    paddingBottom: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  skipButton: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayBackground,
  },
  skipButtonDisabled: {
    opacity: 0.5,
  },
  skipLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  headerCenter: {
    alignItems: 'center',
  },
  strangerLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    letterSpacing: 2,
    color: colors.ink,
  },
  reportButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayBackground,
  },
  unavailableToastWrap: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  unavailableToast: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 4,
  },
  unavailableToastText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  reportGlyph: {
    fontSize: 15,
    color: colors.danger,
  },
  threadArea: {
    flex: 1,
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 10,
  },
  introCardWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 8,
  },
  introCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.white,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 3,
    marginBottom: 4,
  },
  introHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  introMascot: {
    width: 80,
    height: 86,
  },
  introTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.ink,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  introCheck: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.success,
  },
  introRuleText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.body,
  },
  introButton: {
    marginTop: 8,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  introButtonLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.white,
  },
  systemPillWrap: {
    alignItems: 'center',
    marginVertical: 4,
  },
  systemPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.overlayBackground,
  },
  systemPillText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.body,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowMe: {
    justifyContent: 'flex-end',
  },
  bubbleRowPartner: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
  },
  bubbleMe: {
    backgroundColor: colors.ink,
    borderBottomRightRadius: 4,
  },
  bubblePartner: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: 4,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  bubbleText: {
    fontFamily: typography.bubble.fontFamily,
    fontSize: 15,
  },
  bubbleTextMe: {
    color: colors.white,
  },
  bubbleTextPartner: {
    color: colors.ink,
  },
  replyIcon: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayBackground,
  },
  replyIconLeft: {
    left: -6,
  },
  replyIconRight: {
    right: -6,
  },
  replyIconGlyph: {
    fontSize: 14,
    color: colors.ink,
  },
  replyPreview: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginBottom: 6,
  },
  replyPreviewMe: {
    borderLeftColor: colors.white,
  },
  replyPreviewPartner: {
    borderLeftColor: colors.ink,
  },
  replyPreviewSender: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },
  replyPreviewSenderMe: {
    color: colors.white,
  },
  replyPreviewSenderPartner: {
    color: colors.ink,
  },
  replyPreviewText: {
    marginTop: 1,
    fontFamily: typography.bubble.fontFamily,
    fontSize: 12,
  },
  replyPreviewTextMe: {
    color: colors.white,
    opacity: 0.8,
  },
  replyPreviewTextPartner: {
    color: colors.body,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.inkMuted,
  },
  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  replyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  replyComposerBar: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 28,
    borderRadius: 2,
    backgroundColor: colors.ink,
    marginRight: 10,
  },
  replyComposerTextColumn: {
    flex: 1,
  },
  replyComposerSender: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  replyComposerText: {
    marginTop: 2,
    fontFamily: typography.bubble.fontFamily,
    fontSize: 13,
    color: colors.body,
  },
  replyComposerClose: {
    fontSize: 16,
    color: colors.inkMuted,
    paddingHorizontal: 6,
  },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 100,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    fontFamily: typography.bubble.fontFamily,
    fontSize: 15,
    color: colors.ink,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    marginBottom: 16, 
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    shadowColor: colors.buttonShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 4,
  },
  sendGlyph: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.white,
  },
});

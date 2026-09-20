import React, { useRef } from 'react';
import { Image, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { colors, fontFamily, radii, spacing, typography } from '../../design/tokens';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';
import type { Mood } from '../moodSelect/MoodSelectScreen';
import { useChatController, type ChatMessage } from './useChatController';

const miliHappy = require('../../assets/images/mili-happy.png');

export interface ChatScreenProps {
  chatSocketService: ChatSocketService;
  mood: Mood;
  topic: string | null;
  onLeave: () => void;
}

export function ChatScreen({ chatSocketService, onLeave }: ChatScreenProps) {
  const {
    messages,
    inputValue,
    setInputValue,
    introDismissed,
    handleDismissIntro,
    handleSend,
    handleLeave,
    skipSecondsRemaining,
    canSkip,
  } = useChatController(chatSocketService, onLeave);
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 12);
  const keyboardGap = 8;

  const handleReport = () => {
    console.log('[Chat] Report tapped — not implemented yet.');
  };

  const handleDismissIntroCard = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    handleDismissIntro();
  };

  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={handleLeave}
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

        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {!introDismissed ? <IntroCard onDismiss={handleDismissIntroCard} /> : null}

          {messages.map(message => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ScrollView>

        <KeyboardStickyView
          style={[styles.inputBar, { paddingBottom: bottomInset }]}
          offset={{ closed: 0, opened: bottomInset - keyboardGap }}
        >
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
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}
          >
            <Text style={styles.sendGlyph}>{'↑'}</Text>
          </Pressable>
        </KeyboardStickyView>
      </SafeAreaView>
    </View>
  );
}

function IntroCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={styles.introCard}>
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
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Got it, let's talk"
        style={({ pressed }) => [styles.introButton, pressed && styles.pressed]}
      >
        <Text style={styles.introButtonLabel}>Got it — let's talk</Text>
      </Pressable>
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

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.sender === 'system') {
    return <SystemPill text={message.text} />;
  }

  const isMe = message.sender === 'me';
  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowPartner]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubblePartner]}>
        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextPartner]}>
          {message.text}
        </Text>
      </View>
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
  reportGlyph: {
    fontSize: 15,
    color: colors.danger,
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 8,
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
  },
  sendButton: {
    width: 44,
    height: 44,
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

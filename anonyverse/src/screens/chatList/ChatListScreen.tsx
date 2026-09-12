import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { colors, spacing, typography } from '../../design/tokens';
import { rgbaAlpha } from '../../design/svgColor';

const miloResting = require('../../assets/images/milo-resting.png');

export interface ChatListScreenProps {
  /** Tap handler for the "Start a chat" CTA. */
  onStartChat: () => void;
  /** Tap handler for the settings button in the header. */
  onOpenSettings: () => void;
}

const GRAPHIC_SIZE = 196;
const DASH_SIZE = 152;
const LOCK_SIZE = 74;
const MILO_WIDTH = 84;
const MILO_HEIGHT = 93.5;

/**
 * Chat List screen — matches the Anonyverse Figma frame "Chat List"
 * (node 14:1495). Chats aren't persisted yet (see docs/flow.md), so this
 * is the permanent empty state rather than a temporary loading one: no
 * saved conversations, only a CTA to start a new one.
 */
export function ChatListScreen({ onStartChat, onOpenSettings }: ChatListScreenProps) {
  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.wordmark}>ANONYVERSE</Text>
            <Pressable
              onPress={onOpenSettings}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={styles.settingsButton}
            >
              <Text style={styles.settingsIcon}>{'⚙'}</Text>
            </Pressable>
          </View>

          <View style={styles.spacerTop} />

          <View style={styles.graphicWrap}>
            <View style={styles.graphicStack}>
              <Svg width={GRAPHIC_SIZE} height={GRAPHIC_SIZE} style={StyleSheet.absoluteFill}>
                <Defs>
                  <RadialGradient id="lockGlow" cx="0.5" cy="0.5" r="0.5">
                    <Stop
                      offset="0%"
                      stopColor="rgba(255,255,255,0.85)"
                      stopOpacity={rgbaAlpha('rgba(255,255,255,0.85)')}
                    />
                    <Stop
                      offset="70%"
                      stopColor="rgba(255,255,255,0)"
                      stopOpacity={rgbaAlpha('rgba(255,255,255,0)')}
                    />
                  </RadialGradient>
                </Defs>
                <Circle
                  cx={GRAPHIC_SIZE / 2}
                  cy={GRAPHIC_SIZE / 2}
                  r={GRAPHIC_SIZE / 2}
                  fill="url(#lockGlow)"
                />
              </Svg>

              <View style={styles.dashedCircle} />

              <View style={styles.lockCircle}>
                <Text style={styles.lockEmoji}>{'🔒'}</Text>
              </View>

              <Image source={miloResting} resizeMode="contain" style={styles.miloResting} />
            </View>
          </View>

          <View style={styles.premiumPill}>
            <Text style={styles.premiumPillText}>Premium · coming soon</Text>
          </View>

          <Text style={[typography.headline, styles.headline]}>
            {"Saved chats aren't\nhere yet"}
          </Text>

          <Text style={[typography.bodyCentered, styles.body]}>
            {"Soon you'll be able to keep the\nconversations that mattered. For now\nevery chat ends when you leave — and\nthat's the whole point."}
          </Text>

          <View style={styles.spacerBottom} />

          <PrimaryButton variant="action" label="Start a chat" onPress={onStartChat} />

          <Text style={[typography.caption, styles.footer]}>
            Next: how are you feeling today?
          </Text>
        </View>
      </SafeAreaView>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    fontFamily: typography.wordmark.fontFamily,
    fontSize: 11.5,
    letterSpacing: 2.76,
    color: colors.body,
    textTransform: 'uppercase',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.overlayBackground,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  settingsIcon: {
    fontSize: 18,
    color: colors.ink,
  },
  spacerTop: {
    flex: 1,
  },
  premiumPill: {
    marginTop: 22,
    backgroundColor: colors.ink,
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  premiumPillText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 9.5,
    letterSpacing: 1.33,
    color: colors.white,
    textTransform: 'uppercase',
  },
  headline: {
    marginTop: 18,
    textAlign: 'center',
  },
  body: {
    marginTop: 13,
    textAlign: 'center',
  },
  graphicWrap: {
    width: '100%',
    alignItems: 'center',
  },
  graphicStack: {
    width: GRAPHIC_SIZE,
    height: GRAPHIC_SIZE,
  },
  dashedCircle: {
    position: 'absolute',
    left: (GRAPHIC_SIZE - DASH_SIZE) / 2,
    top: (GRAPHIC_SIZE - DASH_SIZE) / 2,
    width: DASH_SIZE,
    height: DASH_SIZE,
    borderRadius: DASH_SIZE / 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.progressTrackInactive,
  },
  lockCircle: {
    position: 'absolute',
    left: (GRAPHIC_SIZE - LOCK_SIZE) / 2,
    top: (GRAPHIC_SIZE - LOCK_SIZE) / 2,
    width: LOCK_SIZE,
    height: LOCK_SIZE,
    borderRadius: LOCK_SIZE / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  lockEmoji: {
    fontSize: 30,
  },
  miloResting: {
    position: 'absolute',
    left: 138,
    top: 108.5,
    width: MILO_WIDTH,
    height: MILO_HEIGHT,
  },
  spacerBottom: {
    flex: 1,
  },
  footer: {
    marginTop: 14,
    textAlign: 'center',
  },
});

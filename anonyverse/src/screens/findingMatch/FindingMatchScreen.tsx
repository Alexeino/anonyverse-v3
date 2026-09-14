import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { MascotPair } from '../../components/MascotPair/MascotPair';
import { StatusCard } from '../../components/StatusCard/StatusCard';
import { colors, fontFamily, spacing, typography } from '../../design/tokens';
import { rgbaAlpha } from '../../design/svgColor';
import { createSocketIoChatSocketService } from '../../services/chatSocket/socketIoChatSocketService';
import { inMemorySessionStore } from '../../services/session/inMemorySessionStore';
import type { TopicsSelection } from '../topics/TopicsScreen';
import { useFindingMatchController } from './useFindingMatchController';

const miliLookingOut = require('../../assets/images/mili-looking-out.png');
const miloExcited = require('../../assets/images/milo-excited.png');

const RING_SIZE = 220;
const GLOW_SIZE = 150;
const MASCOT_AREA_HEIGHT = RING_SIZE + 60;
const GLOW_COLOR = 'rgba(242,165,224,0.34)';
const GLOW_COLOR_TRANSPARENT = 'rgba(242,165,224,0)';

export interface FindingMatchScreenProps {
  selection: TopicsSelection;
  /** Called when the user cancels the search (close button) — the caller decides where "back" goes. */
  onClose: () => void;
}

/**
 * "Finding a Connection" screen — matches the Anonyverse Figma frame
 * "Finding Match" (node 10:937). Connects to the matchmaking socket (see
 * useFindingMatchController) as soon as it mounts and stays on this single
 * visual state whether the server says "queued" or "matched" via join_chat's
 * ack — only the match_found event (phase 'matched') changes what's shown.
 * There's no chat screen to hand off to yet, so 'matched' just swaps the
 * bottom card to a confirmation; wiring an actual navigation is future work.
 */
export function FindingMatchScreen({ selection, onClose }: FindingMatchScreenProps) {
  const { phase, error, handleClose } = useFindingMatchController(
    selection,
    inMemorySessionStore,
    createSocketIoChatSocketService,
    onClose,
  );

  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel search"
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <Text style={styles.closeGlyph}>{'×'}</Text>
            </Pressable>
          </View>

          <Text style={[typography.headline, styles.headline]}>Finding a connection</Text>
          <Text style={[typography.bodyCentered, styles.subtext]}>
            {'Hang tight while we match you with\nsomeone who gets you.'}
          </Text>

          <View style={styles.mascotArea}>
            <View style={styles.dashedRing} />

            <Svg width={GLOW_SIZE} height={GLOW_SIZE} style={styles.glow} pointerEvents="none">
              <Defs>
                <RadialGradient id="findingMatchGlow" cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0%" stopColor={GLOW_COLOR} stopOpacity={rgbaAlpha(GLOW_COLOR)} />
                  <Stop
                    offset="70%"
                    stopColor={GLOW_COLOR_TRANSPARENT}
                    stopOpacity={rgbaAlpha(GLOW_COLOR_TRANSPARENT)}
                  />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width="100%" height="100%" fill="url(#findingMatchGlow)" />
            </Svg>

            <MascotPair
              height={MASCOT_AREA_HEIGHT}
              leftImage={miliLookingOut}
              rightImage={miloExcited}
              leftLayout={{ left: 8, top: 20, width: 110, height: 131 }}
              rightLayout={{ left: 154, top: 145, width: 118, height: 121 }}
            />

            <View style={[styles.sparkle, styles.sparkleOne, { backgroundColor: colors.bubblePink }]} />
            <View style={[styles.sparkle, styles.sparkleTwo, { backgroundColor: colors.blobPurple[1] }]} />
            <View style={[styles.sparkle, styles.sparkleThree, { backgroundColor: colors.bubbleBlue }]} />
          </View>

          <View style={styles.spacer} />

          {phase === 'error' ? (
            <StatusCard
              variant="error"
              title="Couldn't connect"
              subtitle={errorSubtitle(error?.reason)}
            />
          ) : phase === 'matched' ? (
            <StatusCard variant="success" title="Match found!" subtitle="Taking you to chat…" />
          ) : (
            <StatusCard
              variant="info"
              icon={'♡'}
              title="You're in a safe space"
              subtitle="Your feelings matter. Always."
            />
          )}

          {phase === 'connecting' || phase === 'searching' ? (
            <Text style={[typography.caption, styles.footer]}>Usually under 20 seconds</Text>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

function errorSubtitle(reason: string | undefined): string {
  switch (reason) {
    case 'AUTH_ERROR':
    case 'MISSING_TOKEN':
      return "You'll need to verify again before we can match you";
    case 'CONNECTION_TIMEOUT':
      return 'That took too long — check your connection and try again';
    default:
      return 'Check your connection and try again';
  }
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeButton: {
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
    elevation: 3,
  },
  closeButtonPressed: {
    opacity: 0.85,
  },
  closeGlyph: {
    fontFamily: fontFamily.semiBold,
    fontSize: 19,
    color: colors.ink,
  },
  headline: {
    marginTop: 28,
    textAlign: 'center',
  },
  subtext: {
    marginTop: 13,
    textAlign: 'center',
  },
  mascotArea: {
    marginTop: 32,
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
    width: 8,
    height: 8,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  sparkleOne: {
    top: 40,
    left: '38%',
    opacity: 0.64,
  },
  sparkleTwo: {
    top: 68,
    left: '52%',
    opacity: 0.55,
  },
  sparkleThree: {
    top: 96,
    left: '64%',
    opacity: 0.59,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    marginTop: 14,
    textAlign: 'center',
  },
});

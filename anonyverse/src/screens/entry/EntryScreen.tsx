import React, { useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  GREETING_BUBBLES_COMPACT_HEIGHT,
  GREETING_BUBBLES_HEIGHT,
  GreetingBubbles,
} from '../../components/GreetingBubbles/GreetingBubbles';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { fontFamily } from '../../design/tokens';
import { secureDeviceIdentityService } from '../../services/deviceIdentity/secureDeviceIdentityService';
import { restAuthService } from '../../services/auth/restAuthService';
import { inMemorySessionStore } from '../../services/session/inMemorySessionStore';
import {
  useEntryController,
  type EntryDestination,
} from './useEntryController';

const mascots = require('../../assets/images/entry-mascots.png');
const MASCOT_ASPECT = 1170 / 1098;
const MASCOT_TOP_INSET = 51 / 1098;

const palette = {
  backgroundTop: '#FFF8FF',
  backgroundMid: '#FBF0FC',
  backgroundBottom: '#F1E7FA',
  glowPurple: '#DDC2FF',
  glowLilac: '#DCCDF4',
  brand: '#6F3D8D',
  headline: '#33205E',
  accent: '#BB2AA6',
  subtitle: '#716781',
  note: '#877C90',
};

export interface EntryScreenProps {
  onContinue: (destination: EntryDestination) => void;
}

export function EntryScreen({ onContinue }: EntryScreenProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height <= 760;

  const { phase, isContinuing, handleStart } = useEntryController(
    secureDeviceIdentityService,
    restAuthService,
    inMemorySessionStore,
    onContinue,
  );

  const [mascotAreaHeight, setMascotAreaHeight] = useState(0);
  const mascotHeight = width / MASCOT_ASPECT;
  const mascotTopInset = mascotHeight * MASCOT_TOP_INSET;
  const compactBubbles =
    mascotAreaHeight > 0 &&
    mascotAreaHeight < mascotHeight + GREETING_BUBBLES_HEIGHT - mascotTopInset;
  const bubblesHeight = compactBubbles
    ? GREETING_BUBBLES_COMPACT_HEIGHT
    : GREETING_BUBBLES_HEIGHT;
  const visibleMascotHeight = mascotAreaHeight
    ? Math.max(
        Math.min(
          mascotHeight,
          mascotAreaHeight - bubblesHeight + mascotTopInset,
        ),
        0,
      )
    : mascotHeight;
  const fadeHeight = mascotHeight * 0.16;

  return (
    <View style={styles.root}>
      <Svg
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id="entryBg" x1="0.33" y1="0" x2="0.67" y2="1">
            <Stop offset="0%" stopColor={palette.backgroundTop} />
            <Stop offset="52%" stopColor={palette.backgroundMid} />
            <Stop offset="100%" stopColor={palette.backgroundBottom} />
          </LinearGradient>
          <RadialGradient id="entryGlowTop" cx="0.95" cy="0.08" r="0.25">
            <Stop
              offset="0%"
              stopColor={palette.glowPurple}
              stopOpacity={0.24}
            />
            <Stop
              offset="100%"
              stopColor={palette.glowPurple}
              stopOpacity={0}
            />
          </RadialGradient>
          <RadialGradient id="entryGlowBottom" cx="0.5" cy="1" r="0.38">
            <Stop
              offset="0%"
              stopColor={palette.glowLilac}
              stopOpacity={0.34}
            />
            <Stop offset="100%" stopColor={palette.glowLilac} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#entryBg)" />
        <Rect width={width} height={height} fill="url(#entryGlowTop)" />
        <Rect width={width} height={height} fill="url(#entryGlowBottom)" />
      </Svg>

      <View
        style={[
          styles.layout,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom + (compact ? 12 : 20),
          },
        ]}
      >
        <Text style={styles.brand}>ANONYVERSE</Text>

        <View
          style={styles.mascotArea}
          onLayout={e => setMascotAreaHeight(e.nativeEvent.layout.height)}
        >
          <View style={[styles.bubbles, { marginBottom: -mascotTopInset }]}>
            <GreetingBubbles compact={compactBubbles} />
          </View>
          <View
            style={[styles.mascotFrame, { width, height: visibleMascotHeight }]}
            pointerEvents="none"
          >
            <Image
              source={mascots}
              style={[styles.mascotImage, { width, height: mascotHeight }]}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessible
              accessibilityLabel="A cheerful pink and blue Anonyverse mascot pair"
            />
            <Svg width={width} height={fadeHeight} style={styles.fade}>
              <Defs>
                <LinearGradient id="mascotFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop
                    offset="0%"
                    stopColor={palette.backgroundMid}
                    stopOpacity={0}
                  />
                  <Stop
                    offset="100%"
                    stopColor={palette.backgroundMid}
                    stopOpacity={1}
                  />
                </LinearGradient>
              </Defs>
              <Rect width={width} height={fadeHeight} fill="url(#mascotFade)" />
            </Svg>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={[styles.headline, compact && styles.headlineCompact]}>
            Talk freely,{'\n'}
            stay <Text style={styles.headlineAccent}>anonymous.</Text>
          </Text>

          <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>
            No names, no identities. Just honest conversations that matter.
          </Text>
          <Text style={[styles.termsCondition]}>Terms & Conditions</Text>
          <View style={[styles.cta, compact && styles.ctaCompact]}>
            {isContinuing ? (
              <PrimaryButton variant="loading" label="Taking you in…" />
            ) : phase === 'ready' ? (
              <PrimaryButton
                variant="action"
                label="Let's start"
                onPress={handleStart}
              />
            ) : (
              <PrimaryButton variant="loading" label="Getting things ready…" />
            )}
          </View>

          <Text style={styles.note}>
            You can leave any conversation, any time.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.backgroundMid,
  },
  layout: {
    flex: 1,
  },
  brand: {
    marginTop: 14,
    marginHorizontal: 25,
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 3.4,
    color: palette.brand,
  },
  bubbles: {
    zIndex: 1,
    alignSelf: 'stretch',
    paddingHorizontal: 27,
  },
  mascotArea: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
  },
  mascotFrame: {
    overflow: 'hidden',
  },
  mascotImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  fade: {
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
  content: {
    marginTop: -10,
    paddingHorizontal: 27,
  },
  headline: {
    fontFamily: fontFamily.bold,
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1.6,
    color: palette.headline,
  },
  headlineCompact: {
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: -1.2,
  },
  headlineAccent: {
    color: palette.accent,
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 12,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 21.7,
    color: palette.subtitle,
  },
  subtitleCompact: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18.6,
  },
  cta: {
    marginTop: 22,
    marginBottom: 15,
  },
  ctaCompact: {
    marginTop: 14,
    marginBottom: 10,
  },
  note: {
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: palette.note,
  },
  termsCondition: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 10,
    marginBottom: -10,
    color: 'purple',
  },
});

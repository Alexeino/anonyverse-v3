import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { MascotPair } from '../../components/MascotPair/MascotPair';
import { OnboardingProgress } from '../../components/OnboardingProgress/OnboardingProgress';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { StatusCard } from '../../components/StatusCard/StatusCard';
import { colors, spacing, typography } from '../../design/tokens';
import { useCrossfade } from '../../hooks/useCrossfade';
import { restAuthService } from '../../services/auth/restAuthService';
import { secureDeviceIdentityService } from '../../services/deviceIdentity/secureDeviceIdentityService';
import { useVerificationController } from './useVerificationController';

const miliChecking = require('../../assets/images/mili-checking.png');
const miloWaiting = require('../../assets/images/milo-waiting.png');
const miliExcited = require('../../assets/images/mili-excited.png');
const miloProud = require('../../assets/images/milo-proud.png');

export interface VerificationScreenProps {
  /** Called once verification succeeds and the hand-off to Mood Check should happen (tap or auto-continue). */
  onVerified: () => void;
}

/**
 * Verification screen — matches the Anonyverse Figma frames:
 *  - "Background+Shadow" (node 10:792): "Just checking you're human".
 *  - "Verified" (node 10:814): "You're a real one".
 *
 * The Cloudflare Turnstile widget itself has no Figma state (it's
 * normally invisible); the interactive-challenge card is custom-built to
 * match the app's existing card/shadow language since Figma doesn't
 * define it — see the on-device report for this flagged explicitly.
 */
export function VerificationScreen({ onVerified }: VerificationScreenProps) {
  const { phase, isContinuing, turnstile, handleContinue } = useVerificationController(
    secureDeviceIdentityService,
    restAuthService,
    onVerified,
  );

  // isContinuing only ever becomes true once phase is already 'verified',
  // so the verified success state keeps showing — only the CTA swaps to an
  // animated transition — while the hand-off to onVerified is in flight
  // (see useVerificationController's CONTINUE_TRANSITION_MS).
  const isVerifiedState = phase === 'verified';

  // Cross-fades the mascot/headline/status-card block on the
  // verifying <-> verified boundary instead of cutting instantly — lags
  // isVerifiedState by design (see useCrossfade), so it swaps mid-fade
  // rather than in sync with OnboardingProgress's own color transition.
  const { displayValue: showVerified, opacity: contentOpacity } = useCrossfade(isVerifiedState);

  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <OnboardingProgress activeSteps={isVerifiedState ? 2 : 1} />

          <Animated.View style={{ opacity: contentOpacity }}>
            <View style={styles.mascotArea}>
              {showVerified ? (
                <View style={styles.floatingPillWrap}>
                  <View style={styles.floatingPill}>
                    <Text style={styles.floatingPillText}>{"You're in!"}</Text>
                  </View>
                </View>
              ) : null}

              {showVerified ? (
                <MascotPair
                  height={238}
                  leftImage={miliExcited}
                  rightImage={miloProud}
                  leftLayout={{ left: 4, top: 85.72, width: 136, height: 127.78 }}
                  rightLayout={{ left: 118, top: 74.92, width: 126, height: 137.61 }}
                  glow={{ colors: ['rgba(34,122,74,0.16)', 'rgba(34,122,74,0)'], opacity: 1 }}
                />
              ) : (
                <MascotPair
                  height={238}
                  leftImage={miliChecking}
                  rightImage={miloWaiting}
                  leftLayout={{ left: 0, top: 57.72, width: 132, height: 150.42 }}
                  rightLayout={{ left: 124, top: 57.28, width: 124, height: 149.3 }}
                  glow={{ colors: ['rgba(242,165,224,0.4)', 'rgba(242,165,224,0)'], opacity: 0.81 }}
                />
              )}
            </View>

            {showVerified ? (
              <>
                <Text style={[typography.headline, styles.headline]}>
                  {"You're a real one"}
                </Text>
                <Text style={[typography.bodyCentered, styles.subtext]}>
                  {'Welcome to Anonyverse. We\'re glad\nyou\'re here.'}
                </Text>
              </>
            ) : (
              <>
                <Text style={[typography.headline, styles.headline]}>
                  {"Just checking\nyou're human"}
                </Text>
                <Text style={[typography.bodyCentered, styles.subtext]}>
                  {'It keeps Anonyverse safe for everyone.\nTakes a few seconds.'}
                </Text>
              </>
            )}

            <View style={styles.statusCardWrap}>
              {showVerified ? (
                <StatusCard
                  variant="success"
                  title="Verification successful"
                  subtitle="No account, no email, nothing stored"
                />
              ) : (
                <StatusCard
                  variant="pending"
                  title="Verifying…"
                  subtitle="Mili & Milo are on it"
                />
              )}
            </View>
          </Animated.View>

          <View style={styles.spacer} />

          {isContinuing ? (
            <PrimaryButton variant="loading" label="Taking you in…" />
          ) : phase === 'verified' ? (
            <PrimaryButton variant="action" label="Continue" onPress={handleContinue} />
          ) : (
            <PrimaryButton variant="disabled" label="Please wait…" />
          )}
        </View>
      </SafeAreaView>

      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={turnstile.needsInteraction ? 'auto' : 'none'}
      >
        <View
          style={[
            styles.turnstileBackdrop,
            turnstile.needsInteraction ? styles.turnstileBackdropVisible : styles.turnstileBackdropHidden,
          ]}
        >
          <View style={styles.turnstileCard}>
            <WebView
              source={{ html: turnstile.html, baseUrl: 'https://localhost' }}
              onMessage={turnstile.handleMessage}
              onError={syntheticEvent => {
                console.error('[Turnstile] WebView failed to load:', syntheticEvent.nativeEvent);
              }}
              onHttpError={syntheticEvent => {
                console.error('[Turnstile] WebView HTTP error:', syntheticEvent.nativeEvent);
              }}
              originWhitelist={[
                'https://localhost',
                'https://challenges.cloudflare.com',
                'about:blank',
                'about:srcdoc',
              ]}
              style={styles.turnstileWebView}
              javaScriptEnabled
              scrollEnabled={false}
              // Kept mounted at real size always — Cloudflare sizes its
              // iframe against the WebView's viewport at the moment it
              // escalates to interactive; resizing after the fact breaks
              // its layout, so only opacity ever toggles here.
            />
          </View>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 26,
    paddingBottom: 24,
  },
  mascotArea: {
    marginTop: 77,
    position: 'relative',
  },
  floatingPillWrap: {
    position: 'absolute',
    top: 28,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  floatingPill: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  floatingPillText: {
    fontFamily: typography.bubble.fontFamily,
    fontSize: 16,
    color: colors.success,
  },
  headline: {
    textAlign: 'center',
  },
  subtext: {
    marginTop: 13,
    textAlign: 'center',
  },
  statusCardWrap: {
    marginTop: 28,
  },
  spacer: {
    flex: 1,
  },
  turnstileBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(50, 21, 101, 0.35)',
  },
  turnstileBackdropVisible: {
    opacity: 1,
  },
  turnstileBackdropHidden: {
    opacity: 0,
  },
  turnstileCard: {
    width: 300,
    height: 70,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  turnstileWebView: {
    width: 300,
    height: 70,
    backgroundColor: 'transparent',
  },
});

import React, { useCallback, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { MascotPair } from '../../components/MascotPair/MascotPair';
import { OnboardingProgress } from '../../components/OnboardingProgress/OnboardingProgress';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { StatusCard } from '../../components/StatusCard/StatusCard';
import { colors, fontFamily, spacing, typography } from '../../design/tokens';
import { useCrossfade } from '../../hooks/useCrossfade';
import { restAuthService } from '../../services/auth/restAuthService';
import { secureDeviceIdentityService } from '../../services/deviceIdentity/secureDeviceIdentityService';
import { inMemorySessionStore } from '../../services/session/inMemorySessionStore';
import { MAX_VERIFY_ATTEMPTS, useVerificationController } from './useVerificationController';

const miliChecking = require('../../assets/images/mili-checking.png');
const miloWaiting = require('../../assets/images/milo-waiting.png');
const miliExcited = require('../../assets/images/mili-excited.png');
const miloProud = require('../../assets/images/milo-proud.png');
const miliPuzzled = require('../../assets/images/mili-puzzled.png');
const miloUnsure = require('../../assets/images/milo-unsure.png');

export interface VerificationScreenProps {
  /** Called once verification succeeds and the hand-off to Mood Check should happen (tap or auto-continue). */
  onVerified: () => void;
}

/** Self-help suggestions shown once every retry has failed — no backend endpoint for "report an issue" exists yet, so these are the only recourse besides the placeholder Report button below. */
const RETRY_CHECKLIST = [
  'Check your internet connectivity',
  'Make sure the app is up to date',
  'Restart the App and Try again',
];

export function VerificationScreen({ onVerified }: VerificationScreenProps) {
  const { phase, isContinuing, attempts, turnstile, handleContinue, handleRetry } =
    useVerificationController(
      secureDeviceIdentityService,
      restAuthService,
      inMemorySessionStore,
      onVerified,
    );

  const attemptsExhausted = attempts >= MAX_VERIFY_ATTEMPTS;
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const handleReportIssue = useCallback(() => {
    if (__DEV__) {
      console.log('[Verification] Report issue tapped (placeholder — no backend endpoint yet).', {
        attempts,
      });
    }
    setReportSubmitted(true);
  }, [attempts]);

  // Cross-fades the mascot/headline/status-card block across all three
  // phases instead of cutting instantly (see useCrossfade). The CTA/
  // progress bar below key off the raw `phase`, not this lagged value —
  // they're meant to change immediately, independent of the crossfade.
  const { displayValue: displayPhase, opacity: contentOpacity } = useCrossfade(phase);

  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <OnboardingProgress activeSteps={displayPhase === 'verified' ? 2 : 1} />

          <Animated.View style={{ opacity: contentOpacity }}>
            <View style={styles.mascotArea}>
              {displayPhase === 'verified' ? (
                <>
                  <View style={styles.floatingPillWrap}>
                    <View style={styles.floatingPill}>
                      <Text style={styles.floatingPillText}>{"You're in!"}</Text>
                    </View>
                  </View>
                  <MascotPair
                    height={238}
                    leftImage={miliExcited}
                    rightImage={miloProud}
                    leftLayout={{ left: 4, top: 85.72, width: 136, height: 127.78 }}
                    rightLayout={{ left: 118, top: 74.92, width: 126, height: 137.61 }}
                    glow={{ colors: ['rgba(34,122,74,0.16)', 'rgba(34,122,74,0)'], opacity: 1 }}
                  />
                </>
              ) : displayPhase === 'failed' ? (
                <MascotPair
                  height={238}
                  leftImage={miliPuzzled}
                  rightImage={miloUnsure}
                  leftLayout={{ left: 6, top: 60, width: 117, height: 131 }}
                  rightLayout={{ left: 145, top: 65, width: 109, height: 121 }}
                  glow={{ colors: ['rgba(163,43,78,0.12)', 'rgba(163,43,78,0)'], opacity: 1 }}
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

            {displayPhase === 'verified' ? (
              <>
                <Text style={[typography.headline, styles.headline]}>
                  {"You're a real one"}
                </Text>
                <Text style={[typography.bodyCentered, styles.subtext]}>
                  {'Welcome to Anonyverse. We\'re glad\nyou\'re here.'}
                </Text>
              </>
            ) : displayPhase === 'failed' ? (
              attemptsExhausted ? (
                <>
                  <Text style={[typography.headline, styles.headline]}>
                    {'Something\nis not right!'}
                  </Text>
                  <Text style={[typography.bodyCentered, styles.subtext]}>
                    {"Maybe it's us not you but please once\ncheck the following"}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[typography.headline, styles.headline]}>
                    {"That didn't\ngo through"}
                  </Text>
                  <Text style={[typography.bodyCentered, styles.subtext]}>
                    {"We couldn't finish the check. It's usually a\nshaky connection — one more try should\ndo it."}
                  </Text>
                </>
              )
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

            {displayPhase === 'failed' && attemptsExhausted ? (
              <View style={styles.checklistWrap}>
                {RETRY_CHECKLIST.map(item => (
                  <View key={item} style={styles.checklistRow}>
                    <View style={styles.checklistBadge}>
                      <Text style={styles.checklistBadgeGlyph}>{'!'}</Text>
                    </View>
                    <Text style={styles.checklistText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.statusCardWrap}>
                {displayPhase === 'verified' ? (
                  <StatusCard
                    variant="success"
                    title="Verification successful"
                    subtitle="No account, no email, nothing stored"
                  />
                ) : displayPhase === 'failed' ? (
                  <StatusCard
                    variant="error"
                    title="Verification didn't complete"
                    subtitle="Check your connection and try again"
                  />
                ) : (
                  <StatusCard
                    variant="pending"
                    title="Verifying…"
                    subtitle="Mili & Milo are on it"
                  />
                )}
              </View>
            )}
          </Animated.View>

          <View style={styles.spacer} />

          {phase === 'failed' && attemptsExhausted ? (
            reportSubmitted ? (
              <PrimaryButton variant="disabled" label="Thanks, reported" />
            ) : (
              <PrimaryButton
                variant="action"
                label="You think it's us, Report Now"
                onPress={handleReportIssue}
              />
            )
          ) : isContinuing ? (
            <PrimaryButton variant="loading" label="Taking you in…" />
          ) : phase === 'verified' ? (
            <PrimaryButton variant="action" label="Continue" onPress={handleContinue} />
          ) : phase === 'failed' ? (
            <>
              <PrimaryButton variant="action" label="Try again" onPress={handleRetry} />
              <Text style={styles.attemptCaption}>
                {`Attempt ${Math.min(attempts, MAX_VERIFY_ATTEMPTS)} of ${MAX_VERIFY_ATTEMPTS}`}
              </Text>
            </>
          ) : (
            <PrimaryButton variant="disabled" label="Please wait…" />
          )}
        </View>
      </SafeAreaView>

      {phase !== 'failed' ? (
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
                // its layout, so only opacity ever toggles here. Unmounted
                // entirely (not just hidden) while phase is 'failed', so
                // retrying gets a genuinely fresh Cloudflare challenge
                // instead of relying on the old widget instance recovering
                // on its own.
              />
            </View>
          </View>
        </View>
      ) : null}
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
  checklistWrap: {
    marginTop: 24,
    gap: 10,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  checklistBadge: {
    width: 23,
    height: 23,
    borderRadius: 11.5,
    backgroundColor: colors.dangerBadgeBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistBadgeGlyph: {
    color: colors.danger,
    fontFamily: typography.headline.fontFamily,
    fontSize: 13,
  },
  checklistText: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  attemptCaption: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    color: colors.body,
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

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { GreetingBubbles } from '../../components/GreetingBubbles/GreetingBubbles';
import { MascotDuo } from '../../components/MascotDuo/MascotDuo';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { colors, spacing, typography } from '../../design/tokens';
import { restAuthService } from '../../services/auth/restAuthService';
import { secureDeviceIdentityService } from '../../services/deviceIdentity/secureDeviceIdentityService';
import { inMemorySessionStore } from '../../services/session/inMemorySessionStore';
import { useEntryController, type EntryDestination } from './useEntryController';

export interface EntryScreenProps {
  /** Called once the Entry screen has decided where the user goes next. */
  onContinue: (destination: EntryDestination) => void;
}

/**
 * Entry screen — matches the Anonyverse Figma frames:
 *  - "Entry" (node 10:769): first-time user, tappable "Let's start".
 *  - "Entry - Returning User" (node 16:1523): returning user, the same
 *    screen shown briefly with a "Getting things ready…" state instead of
 *    a CTA, before automatically continuing to Chat List.
 */
export function EntryScreen({ onContinue }: EntryScreenProps) {
  const { phase, isContinuing, handleStart } = useEntryController(
    secureDeviceIdentityService,
    restAuthService,
    inMemorySessionStore,
    onContinue,
  );

  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={[typography.wordmark, styles.wordmark]}>ANONYVERSE</Text>

          <View style={styles.bubbles}>
            <GreetingBubbles />
          </View>

          <View style={styles.mascots}>
            <MascotDuo />
          </View>

          <Text style={[typography.headline, styles.headline]}>
            Talk freely,{'\n'}
            stay <Text style={styles.headlineAccent}>anonymous</Text>.
          </Text>

          <Text style={[typography.body, styles.body]}>
            No names, no identities. Just honest{'\n'}conversations that matter.
          </Text>

          <View style={styles.spacer} />

          {isContinuing ? (
            <PrimaryButton variant="loading" label="Taking you in…" />
          ) : phase === 'ready' ? (
            <PrimaryButton variant="action" label="Let's start" onPress={handleStart} />
          ) : (
            <PrimaryButton variant="loading" label="Getting things ready…" />
          )}

          <Text style={[typography.caption, styles.footer]}>
            You can leave any conversation, any time.
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
    paddingTop: 24,
    paddingBottom: 24,
  },
  wordmark: {
    textAlign: 'center',
  },
  bubbles: {
    marginTop: 20,
  },
  mascots: {
    marginTop: 33,
  },
  headline: {
    marginTop: 18,
  },
  headlineAccent: {
    color: colors.accentPink,
  },
  body: {
    marginTop: 15,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    marginTop: 14,
    textAlign: 'center',
  },
});

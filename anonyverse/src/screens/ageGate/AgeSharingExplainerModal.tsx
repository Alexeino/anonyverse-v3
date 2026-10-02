import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { colors, fontFamily, radii } from '../../design/tokens';
import { AgeModalShell } from './AgeModalShell';

export interface AgeSharingExplainerModalProps {
  onContinue: () => void;
}

// Doesn't name the age limit: someone who declines Apple's sheet gets the date-of-birth popup next.
export function AgeSharingExplainerModal({ onContinue }: AgeSharingExplainerModalProps) {
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);

  const handleContinue = () => {
    if (pressedRef.current) {
      return;
    }
    pressedRef.current = true;
    setPressed(true);
    onContinue();
  };

  return (
    <AgeModalShell>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>QUICK AGE CHECK</Text>
      </View>
      <Text style={styles.title}>{'Your phone will ask\nabout your age'}</Text>
      <Text style={styles.subtitle}>
        {"Next, your phone asks whether to share your\nage range with Anonyverse. We only see the\nrange, never your birthday."}
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelText}>{"If you'd rather not share, you can enter\nyour date of birth instead."}</Text>
      </View>

      <View style={styles.button}>
        {pressed ? (
          <PrimaryButton variant="loading" label="One moment…" />
        ) : (
          <PrimaryButton variant="action" label="Continue" onPress={handleContinue} />
        )}
      </View>
    </AgeModalShell>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.infoBadgeBackground,
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.softChipText,
  },
  title: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 27,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.body,
  },
  panel: {
    marginTop: 18,
    alignSelf: 'stretch',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.infoPanelBackground,
  },
  panelText: {
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  button: {
    marginTop: 22,
    alignSelf: 'stretch',
  },
});

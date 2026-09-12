import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../../design/tokens';

export type StatusCardProps =
  | {
      variant: 'pending';
      title: string;
      subtitle: string;
    }
  | {
      variant: 'success';
      title: string;
      subtitle: string;
    }
  | {
      variant: 'info';
      title: string;
      subtitle: string;
      /** Glyph shown in the badge, e.g. a heart for "You're in a safe space". */
      icon: string;
    };

/**
 * Shared status card, matching node 10:803 ("Verifying...") / node 10:825
 * ("Verification successful") in the Verification Figma frames, and node
 * 10:858 ("You're in a safe space") in the Mood Select frame —
 * architecture.md names "Status card" directly as a shared component.
 */
export function StatusCard(props: StatusCardProps) {
  return (
    <View style={styles.card}>
      {props.variant === 'pending' ? (
        <ActivityIndicator color={colors.bubblePink} size="small" />
      ) : props.variant === 'success' ? (
        <View style={styles.checkBadge}>
          <Text style={styles.checkMark}>{'✓'}</Text>
        </View>
      ) : (
        <View style={styles.infoBadge}>
          <Text style={styles.infoIcon}>{props.icon}</Text>
        </View>
      )}
      <View style={styles.textColumn}>
        <Text style={styles.title}>{props.title}</Text>
        <Text style={styles.subtitle}>{props.subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 24,
    backgroundColor: colors.statusCardBackground,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 3,
  },
  checkBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: colors.white,
    fontFamily: typography.headline.fontFamily,
    fontSize: 19,
  },
  infoBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.infoBadgeBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIcon: {
    color: colors.ink,
    fontSize: 17,
  },
  textColumn: {
    flexShrink: 1,
  },
  title: {
    fontFamily: typography.headline.fontFamily,
    fontSize: 15,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: typography.body.fontFamily,
    fontSize: 13,
    color: colors.body,
    marginTop: 2,
  },
});

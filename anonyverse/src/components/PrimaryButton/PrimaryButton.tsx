import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, typography } from '../../design/tokens';

type PrimaryButtonProps =
  | {
      variant: 'action';
      label: string;
      onPress: () => void;
      accessibilityLabel?: string;
    }
  | {
      variant: 'loading';
      label: string;
    };

/**
 * Shared pill-shaped primary CTA, matching node 10:786 ("Let's start") and
 * its in-progress counterpart node 16:1540 ("Getting things ready...") in
 * the Entry Figma frames.
 *
 * The source design draws the loading state's indicator as a static ring
 * glyph; that is rendered here as a real spinning ActivityIndicator so the
 * "in progress" state actually communicates motion.
 */
export function PrimaryButton(props: PrimaryButtonProps) {
  if (props.variant === 'loading') {
    return (
      <View style={styles.button}>
        <ActivityIndicator color={colors.white} size="small" />
        <Text style={[typography.button, styles.label]}>{props.label}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={[typography.button, styles.label]}>{props.label}</Text>
      <Text style={[typography.button, styles.arrow]}>{'→'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 60,
    width: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    shadowColor: colors.buttonShadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 13,
    elevation: 6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  label: {
    textAlign: 'center',
  },
  arrow: {
    fontFamily: typography.button.fontFamily,
  },
});

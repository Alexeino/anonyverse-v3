import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '../../design/tokens';

export interface LeaveChatConfirmModalProps {
  onDismiss: () => void;
  onSavePartner: () => void;
  onLeaveChat: () => void;
}

/**
 * Confirmation shown when the user tries to back out of an active chat.
 * A dialog, not a "searching" state, so it gets a plain dark scrim rather
 * than the blurred backdrop used by FindingNewMatchModal.
 */
export function LeaveChatConfirmModal({ onDismiss, onSavePartner, onLeaveChat }: LeaveChatConfirmModalProps) {
  return (
    <View style={styles.root}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Keep chatting"
      />

      <View style={styles.card}>
        <Text style={styles.title}>You can't leave mid-chat</Text>
        <Text style={styles.subtitle}>
          Save this partner to talk again later, or leave now — they'll go back to finding someone new.
        </Text>

        <Pressable
          onPress={onSavePartner}
          accessibilityRole="button"
          accessibilityLabel="Save partner for 9 rupees"
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
        >
          <Text style={styles.saveButtonLabel}>Save partner · ₹9</Text>
        </Pressable>

        <Pressable
          onPress={onLeaveChat}
          accessibilityRole="button"
          accessibilityLabel="Leave chat"
          style={({ pressed }) => [styles.leaveButton, pressed && styles.pressed]}
        >
          <Text style={styles.leaveButtonLabel}>Leave chat</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(50, 21, 101, 0.55)',
    paddingHorizontal: spacing.screenHorizontal,
  },
  card: {
    width: '100%',
    padding: 24,
    borderRadius: 28,
    alignItems: 'center',
    backgroundColor: colors.white,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 5,
  },
  title: {
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.body,
  },
  saveButton: {
    marginTop: 20,
    width: '100%',
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  saveButtonLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.white,
  },
  leaveButton: {
    marginTop: 12,
    width: '100%',
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.disabledButtonBackground,
  },
  leaveButtonLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.danger,
  },
  pressed: {
    opacity: 0.85,
  },
});

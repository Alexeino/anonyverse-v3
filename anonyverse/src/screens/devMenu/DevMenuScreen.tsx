import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, radii, spacing } from '../../design/tokens';

export interface DevMenuEntry {
  label: string;
  description: string;
  onPress: () => void;
}

export interface DevMenuScreenProps {
  entries: DevMenuEntry[];
  onClose: () => void;
}

/** DEV-only screen listing every screen, so they can be checked out directly. Only reachable when __DEV__ is true. */
export function DevMenuScreen({ entries, onClose }: DevMenuScreenProps) {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Dev Menu</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close dev menu"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeGlyph}>{'×'}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {entries.map(entry => (
            <Pressable
              key={entry.label}
              onPress={entry.onPress}
              accessibilityRole="button"
              accessibilityLabel={entry.label}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.rowLabel}>{entry.label}</Text>
              <Text style={styles.rowDescription}>{entry.description}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A1023',
  },
  safeArea: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 0,
    paddingBottom: 16,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.white,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  closeGlyph: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.white,
  },
  list: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: 24,
    gap: 10,
  },
  row: {
    padding: 16,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rowLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.white,
  },
  rowDescription: {
    marginTop: 3,
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.6)',
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, typography } from '../../design/tokens';

/**
 * The scattered "Ciao! / Halo! / Hoi!" greeting-bubble collage above the
 * mascots, matching node 10:776-10:781 in the Entry Figma frame.
 * Positions are authored as an absolute collage (as in the source design)
 * inside a fixed-height container; everything else on the screen uses
 * normal flex flow.
 */
export function GreetingBubbles() {
  return (
    <View style={styles.container}>
      <View style={[styles.bubble, styles.ciaoBubble]}>
        <Text style={[typography.bubble, { color: colors.bubblePink }]}>Ciao!</Text>
      </View>

      <View style={[styles.bubble, styles.haloBubble]}>
        <Text style={typography.overlayBubble}>Halo!</Text>
      </View>

      <View style={[styles.bubble, styles.hoiBubble]}>
        <Text style={[typography.bubble, { color: colors.bubbleBlue }]}>Hoi!</Text>
      </View>
    </View>
  );
}

const shadow = {
  shadowColor: colors.cardShadow,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 1,
  shadowRadius: 8,
  elevation: 3,
};

const styles = StyleSheet.create({
  container: {
    height: 90,
    width: '100%',
  },
  bubble: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    height: 40,
  },
  ciaoBubble: {
    left: 6,
    top: 12,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    borderBottomLeftRadius: radii.sm,
    ...shadow,
  },
  haloBubble: {
    left: 116,
    top: 0,
    height: 36,
    backgroundColor: colors.overlayBackground,
    borderRadius: radii.md,
  },
  hoiBubble: {
    right: 2,
    top: 50,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.sm,
    ...shadow,
  },
});

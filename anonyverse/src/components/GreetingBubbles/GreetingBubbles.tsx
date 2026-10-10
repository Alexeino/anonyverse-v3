import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radii, typography } from '../../design/tokens';

export const GREETING_BUBBLES_HEIGHT = 118;
export const GREETING_BUBBLES_COMPACT_HEIGHT = 48;

type Tone = 'pink' | 'blue' | 'soft';
type Tail = 'left' | 'right' | 'none';

const bubbles: {
  text: string;
  tone: Tone;
  tail: Tail;
  position: ViewStyle;
  compactPosition?: ViewStyle;
}[] = [
  {
    text: 'Halo!',
    tone: 'soft',
    tail: 'none',
    position: { left: '45%', top: 18 },
    compactPosition: { left: '38%', top: 0 },
  },
  {
    text: 'Hoi!',
    tone: 'blue',
    tail: 'right',
    position: { right: '2%', top: 26 },
    compactPosition: { right: '2%', top: 8 },
  },
  {
    text: 'Hola!',
    tone: 'soft',
    tail: 'none',
    position: { left: '25%', top: 78 },
  },
  {
    text: 'Ciao!',
    tone: 'pink',
    tail: 'left',
    position: { left: '56%', top: 100 },
    compactPosition: { left: '4%', top: 6 },
  },
];

export function GreetingBubbles({ compact = false }: { compact?: boolean }) {
  return (
    <View
      style={[
        styles.container,
        {
          height: compact
            ? GREETING_BUBBLES_COMPACT_HEIGHT
            : GREETING_BUBBLES_HEIGHT,
        },
      ]}
    >
      {bubbles
        .filter(bubble => !compact || bubble.compactPosition)
        .map(({ text, tone, tail, position, compactPosition }) => (
          <View
            key={text}
            style={[
              styles.bubble,
              tone === 'soft' ? styles.softBubble : styles.solidBubble,
              tail === 'left' && styles.tailLeft,
              tail === 'right' && styles.tailRight,
              compact ? compactPosition : position,
            ]}
          >
            <Text
              style={
                tone === 'soft'
                  ? typography.overlayBubble
                  : [
                      typography.bubble,
                      {
                        color:
                          tone === 'pink'
                            ? colors.bubblePink
                            : colors.bubbleBlue,
                      },
                    ]
              }
            >
              {text}
            </Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  bubble: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  solidBubble: {
    height: 40,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  softBubble: {
    height: 36,
    backgroundColor: colors.overlayBackground,
    borderRadius: radii.md,
  },
  tailLeft: {
    borderBottomLeftRadius: radii.sm,
  },
  tailRight: {
    borderBottomRightRadius: radii.sm,
  },
});

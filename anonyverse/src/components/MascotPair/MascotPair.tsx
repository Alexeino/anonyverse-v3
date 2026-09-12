import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { rgbaAlpha } from '../../design/svgColor';

export interface MascotPairProps {
  leftImage: ImageSourcePropType;
  rightImage: ImageSourcePropType;
  leftLayout: { left: number; top: number; width: number; height: number };
  rightLayout: { left: number; top: number; width: number; height: number };
  /** Radial glow behind the pair — [innerColor, outerColor] with alpha baked in, or omit for none. */
  glow?: { colors: readonly [string, string]; opacity: number };
  height: number;
}

/**
 * Two mascots (Mili + Milo, in whichever pose a given screen needs) with
 * an optional soft radial glow behind them. Generalizes the pairing used
 * across the Entry and Verification Figma frames — each screen supplies
 * its own image assets, layout, and glow tint.
 */
export function MascotPair({
  leftImage,
  rightImage,
  leftLayout,
  rightLayout,
  glow,
  height,
}: MascotPairProps) {
  return (
    <View style={[styles.container, { height }]}>
      {glow ? (
        <Svg
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <RadialGradient id="mascotGlow" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0%" stopColor={glow.colors[0]} stopOpacity={rgbaAlpha(glow.colors[0])} />
              <Stop offset="68%" stopColor={glow.colors[1]} stopOpacity={rgbaAlpha(glow.colors[1])} />
            </RadialGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#mascotGlow)"
            opacity={glow.opacity}
          />
        </Svg>
      ) : null}

      <Image
        source={leftImage}
        resizeMode="contain"
        style={[styles.mascot, leftLayout]}
      />
      <Image
        source={rightImage}
        resizeMode="contain"
        style={[styles.mascot, rightLayout]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  mascot: {
    position: 'absolute',
  },
});

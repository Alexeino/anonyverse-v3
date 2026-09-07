import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../design/tokens';

/**
 * Full-bleed gradient background + the two soft decorative blobs anchored
 * to the bottom corners, matching Entry (node 10:769) / Entry - Returning
 * User (node 16:1523) in the Anonyverse Figma file.
 */
export function BackgroundGradient() {
  const { width, height } = useWindowDimensions();

  const pinkBlob = { cx: 80, cy: height - 215, rx: 150, ry: 125 };
  const purpleBlob = { cx: width - 80, cy: height - 245, rx: 160, ry: 135 };

  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="entryBackground" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={colors.gradientBackground[0]} />
          <Stop offset="48%" stopColor={colors.gradientBackground[1]} />
          <Stop offset="100%" stopColor={colors.gradientBackground[2]} />
        </LinearGradient>
        <RadialGradient id="entryBlobPink" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0%" stopColor={colors.blobPink[0]} />
          <Stop offset="100%" stopColor={colors.blobPink[1]} />
        </RadialGradient>
        <RadialGradient id="entryBlobPurple" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0%" stopColor={colors.blobPurple[0]} />
          <Stop offset="100%" stopColor={colors.blobPurple[1]} />
        </RadialGradient>
      </Defs>

      <Rect x={0} y={0} width={width} height={height} fill="url(#entryBackground)" />
      <Ellipse
        cx={pinkBlob.cx}
        cy={pinkBlob.cy}
        rx={pinkBlob.rx}
        ry={pinkBlob.ry}
        fill="url(#entryBlobPink)"
        opacity={0.55}
      />
      <Ellipse
        cx={purpleBlob.cx}
        cy={purpleBlob.cy}
        rx={purpleBlob.rx}
        ry={purpleBlob.ry}
        fill="url(#entryBlobPurple)"
        opacity={0.5}
      />
    </Svg>
  );
}

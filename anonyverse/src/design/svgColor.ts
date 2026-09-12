/**
 * react-native-svg's <Stop> ignores alpha embedded in an rgba() stopColor —
 * it masks the color down to RGB and applies stopOpacity (default 1, i.e.
 * fully opaque) instead (see react-native-svg's extractGradient.ts). So the
 * alpha in an rgba() gradient color has to be pulled out and passed as
 * stopOpacity explicitly, or a "transparent" stop renders fully opaque.
 */
export function rgbaAlpha(rgba: string): number {
  const match = rgba.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/);
  return match ? Number(match[1]) : 1;
}

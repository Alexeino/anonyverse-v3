/**
 * Design tokens sourced from the Anonyverse Figma file
 * (Master-Board, node 10:769 "Entry" / node 16:1523 "Entry - Returning User").
 *
 * No Figma variables/styles are defined on these nodes (get_variable_defs
 * returned an empty set), so these are the raw values read directly off
 * the design rather than a mapping to existing Figma tokens.
 */

export const colors = {
  ink: '#321565',
  inkMuted: 'rgba(50, 21, 101, 0.55)',
  overlayText: 'rgba(50, 21, 101, 0.5)',
  body: '#514F53',
  accentPink: '#D174B9',
  bubblePink: '#F2A5E0',
  bubbleBlue: '#93B3FB',
  white: '#FFFFFF',
  overlayBackground: 'rgba(255, 255, 255, 0.72)',
  cardShadow: 'rgba(50, 21, 101, 0.12)',
  buttonShadow: 'rgba(50, 21, 101, 0.28)',
  gradientBackground: ['#FCF2FB', '#F4E6F9', '#EBD9F5'] as const,
  blobPink: ['#F9C4EC', '#F2A5E0'] as const,
  blobPurple: ['#EAD3FB', '#C9A6F2'] as const,
} as const;

export const fontFamily = {
  regular: 'Nunito-Regular',
  medium: 'Nunito-Medium',
  semiBold: 'Nunito-SemiBold',
  bold: 'Nunito-Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  screenHorizontal: 28,
} as const;

export const radii = {
  sm: 6,
  md: 16,
  lg: 20,
  pill: 30,
} as const;

export const typography = {
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    letterSpacing: 3.38,
    color: colors.inkMuted,
  },
  bubble: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
  },
  overlayBubble: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.overlayText,
  },
  headline: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.32,
    color: colors.ink,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 15.5,
    lineHeight: 24,
    color: colors.body,
  },
  button: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: 0.15,
    color: colors.white,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    color: colors.body,
  },
} as const;

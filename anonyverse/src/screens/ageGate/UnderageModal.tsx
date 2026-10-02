import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { MascotPair } from '../../components/MascotPair/MascotPair';
import { rgbaAlpha } from '../../design/svgColor';
import { colors, fontFamily, radii } from '../../design/tokens';
import type { CalendarDate } from '../../services/ageGate/ageRules';
import { AgeModalShell } from './AgeModalShell';

const miliPuzzled = require('../../assets/images/mili-puzzled.png');
const miloSad = require('../../assets/images/milo-sad.png');

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const RING_SIZE = 150;
const GLOW_SIZE = 120;
const MASCOT_AREA_HEIGHT = RING_SIZE + 10;
const GLOW_COLOR = 'rgba(242,165,224,0.34)';
const GLOW_COLOR_TRANSPARENT = 'rgba(242,165,224,0)';

export interface UnderageModalProps {
  lockUntil?: CalendarDate | null;
}

export function UnderageModal({ lockUntil }: UnderageModalProps) {
  return (
    <AgeModalShell>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>18+ ONLY</Text>
      </View>

      <View style={styles.mascotArea}>
        <View style={styles.dashedRing} />
        <Svg width={GLOW_SIZE} height={GLOW_SIZE} style={styles.glow} pointerEvents="none">
          <Defs>
            <RadialGradient id="underageGlow" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0%" stopColor={GLOW_COLOR} stopOpacity={rgbaAlpha(GLOW_COLOR)} />
              <Stop offset="70%" stopColor={GLOW_COLOR_TRANSPARENT} stopOpacity={rgbaAlpha(GLOW_COLOR_TRANSPARENT)} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill="url(#underageGlow)" />
        </Svg>
        <MascotPair
          height={MASCOT_AREA_HEIGHT}
          pairWidth={200}
          leftImage={miliPuzzled}
          rightImage={miloSad}
          leftLayout={{ left: 6, top: 30, width: 92, height: 104 }}
          rightLayout={{ left: 104, top: 34, width: 90, height: 100 }}
        />
      </View>

      <Text style={styles.title}>{"Sorry, you can't use\nAnonyverse yet"}</Text>
      <Text style={styles.subtitle}>Anonyverse is only for people aged 18 and over.</Text>

      <View style={styles.panel}>
        {lockUntil ? (
          <>
            <Text style={styles.panelLabel}>See you on</Text>
            <Text style={styles.panelDate}>
              {`${lockUntil.day} ${MONTH_NAMES[lockUntil.month - 1]} ${lockUntil.year}`}
            </Text>
          </>
        ) : (
          <Text style={styles.panelLabel}>{"We'll be here when you're ready."}</Text>
        )}
      </View>

      <Text style={styles.footer}>Nothing you entered left your phone.</Text>
    </AgeModalShell>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerBadgeBackground,
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.danger,
  },
  mascotArea: {
    marginTop: 8,
    width: '100%',
    height: MASCOT_AREA_HEIGHT,
  },
  dashedRing: {
    position: 'absolute',
    top: (MASCOT_AREA_HEIGHT - RING_SIZE) / 2,
    left: '50%',
    marginLeft: -RING_SIZE / 2,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.progressTrackInactive,
  },
  glow: {
    position: 'absolute',
    top: (MASCOT_AREA_HEIGHT - GLOW_SIZE) / 2,
    left: '50%',
    marginLeft: -GLOW_SIZE / 2,
  },
  title: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 27,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.body,
  },
  panel: {
    marginTop: 18,
    alignSelf: 'stretch',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.infoPanelBackground,
  },
  panelLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12.5,
    color: colors.inkMuted,
  },
  panelDate: {
    marginTop: 2,
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.ink,
  },
  footer: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 11.5,
    color: colors.overlayText,
  },
});

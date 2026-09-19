import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGradient } from '../../components/BackgroundGradient/BackgroundGradient';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { colors, fontFamily, spacing, typography } from '../../design/tokens';
import type { Mood } from '../moodSelect/MoodSelectScreen';

const miliExcited = require('../../assets/images/mili-excited.png');
const miloSad = require('../../assets/images/milo-sad.png');

export interface TopicsSelection {
  mood: Mood;
  tags: string[];
  optedIn: boolean;
}

export interface TopicsScreenProps {
  mood: Mood;
  onFindSomeone: (selection: TopicsSelection) => void;
}

interface Topic {
  id: string;
  label: string;
}

const TOOLTIP_AUTO_HIDE_MS = 2500;

const GOOD_TOPICS: Topic[] = [
  { id: 'life', label: 'Life' },
  { id: 'work', label: 'Work' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'health', label: 'Health' },
  { id: 'hobbies', label: 'Hobbies' },
  { id: 'overthinking', label: 'Overthinking' },
  { id: 'love', label: 'Love' },
  { id: 'career', label: 'Career' },
];

const LOW_TOPICS: Topic[] = [
  { id: 'overthinking', label: 'Overthinking' },
  { id: 'work', label: 'Work' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'health', label: 'Health' },
  { id: 'life', label: 'Life' },
  { id: 'love', label: 'Love' },
  { id: 'loneliness', label: 'Loneliness' },
  { id: 'just-venting', label: 'Just venting' },
];

/**
 * Per-mood content for the Topics screen — matches the Anonyverse Figma
 * frames "Mili Topics" (node 10:865, mood: 'good') and "Milo Topics"
 * (node 10:903, mood: 'low'). The opt-in banner ("Help someone lift their
 * mood") only appears on the 'good' variant — per docs/api.md, join_chat's
 * optedIn flag is "shown as a banner on the happy topic-selection screen"
 * specifically, not the low-mood one.
 */
const MOOD_CONTENT: Record<
  Mood,
  {
    accentColor: string;
    headlineLead: string;
    headlineAccent: string;
    subtitle: string;
    mascot: number;
    infoIconColor: string;
    infoIconBackground: string;
    infoTitle: string;
    infoSubtitle: string;
    /** The opt-in toggle only appears on the 'good' variant (see comment below). */
    hasOptInToggle: boolean;
    chipSelectedBackground: string;
    chipSelectedBorder: string;
    topics: Topic[];
  }
> = {
  good: {
    accentColor: colors.moodGoodLabel,
    headlineLead: 'Feeling good,',
    headlineAccent: 'Mili is happy\ntoo!',
    subtitle: "Pick what you'd love to talk about",
    mascot: miliExcited,
    infoIconColor: colors.moodGoodLabel,
    infoIconBackground: colors.moodGoodCardGradient[1],
    infoTitle: 'Help someone lift their mood',
    infoSubtitle: '3 people need a listening ear today',
    hasOptInToggle: true,
    chipSelectedBackground: colors.moodGoodChipSelected,
    chipSelectedBorder: colors.bubblePink,
    topics: GOOD_TOPICS,
  },
  low: {
    accentColor: colors.moodLowLabel,
    headlineLead: 'Feeling low,',
    headlineAccent: "Milo's here with\nyou.",
    subtitle: "Pick what's sitting with you",
    mascot: miloSad,
    infoIconColor: colors.moodLowLabel,
    infoIconBackground: colors.moodLowCardGradient[1],
    infoTitle: "We'll find you a good listener",
    infoSubtitle: 'Several people are here to help right now',
    hasOptInToggle: false,
    chipSelectedBackground: colors.moodLowChipSelected,
    chipSelectedBorder: colors.bubbleBlue,
    topics: LOW_TOPICS,
  },
};

/**
 * Topics screen — matches the Anonyverse Figma frames "Mili Topics" /
 * "Milo Topics" (nodes 10:865 / 10:903), the step right after Mood Select.
 * Picking topics and tapping "Find someone" is meant to feed
 * join_chat(tags, mood, optedIn) per docs/api.md — matchmaking itself
 * (Finding a Connection) doesn't exist yet, so onFindSomeone is a
 * placeholder hand-off for now.
 */
export function TopicsScreen({ mood, onFindSomeone }: TopicsScreenProps) {
  const content = MOOD_CONTENT[mood];
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [optedIn, setOptedIn] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipMounted, setTooltipMounted] = useState(false);
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (showTooltip) {
      setTooltipMounted(true);
      Animated.timing(tooltipOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
      const timer = setTimeout(() => setShowTooltip(false), TOOLTIP_AUTO_HIDE_MS);
      return () => clearTimeout(timer);
    }

    // Fade out before unmounting the tooltip, instead of cutting it
    // instantly — matches the fade-in on the way in.
    Animated.timing(tooltipOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(result => {
      if (result.finished && mountedRef.current) {
        setTooltipMounted(false);
      }
    });
    return undefined;
  }, [showTooltip, tooltipOpacity]);

  useEffect(() => {
    if (selectedIds.length > 0) {
      setShowTooltip(false);
    }
  }, [selectedIds.length]);

  const toggleTopic = (id: string) => {
    setSelectedIds(current =>
      current.includes(id) ? current.filter(existing => existing !== id) : [...current, id],
    );
  };

  const handleFindSomeone = () => {
    if (selectedIds.length === 0) {
      setShowTooltip(true);
      return;
    }
    const selectedOptIn = content.hasOptInToggle ? optedIn : false;
    onFindSomeone({ mood, tags: selectedIds, optedIn: selectedOptIn });
  };

  const rows: Topic[][] = [];
  for (let i = 0; i < content.topics.length; i += 2) {
    rows.push(content.topics.slice(i, i + 2));
  }

  return (
    <View style={styles.root}>
      <BackgroundGradient />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[typography.headline, styles.headline]}>
              {content.headlineLead}
              {'\n'}
              <Text style={{ color: content.accentColor }}>{content.headlineAccent}</Text>
            </Text>
            <Image source={content.mascot} resizeMode="contain" style={styles.mascot} />
          </View>

          <Text style={styles.subtitle}>{content.subtitle}</Text>

          <View style={styles.infoCard}>
            <View style={[styles.infoIcon, { backgroundColor: content.infoIconBackground }]}>
              <Text style={[styles.infoIconGlyph, { color: content.infoIconColor }]}>{'♡'}</Text>
            </View>
            <View style={styles.infoTextColumn}>
              <Text style={styles.infoTitle}>{content.infoTitle}</Text>
              <Text style={[styles.infoSubtitle, { color: content.accentColor }]}>
                {content.infoSubtitle}
              </Text>
            </View>
            {content.hasOptInToggle ? (
              <OptInToggle value={optedIn} onValueChange={setOptedIn} />
            ) : null}
          </View>

          <View style={styles.chipGrid}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.chipRow}>
                {row.map(topic => {
                  const selected = selectedIds.includes(topic.id);
                  const backgroundColor = selected
                    ? content.chipSelectedBackground
                    : colors.chipBackground;
                  const borderColor = selected ? content.chipSelectedBorder : 'transparent';
                  const labelColor = selected ? content.accentColor : colors.ink;

                  return (
                    <Pressable
                      key={topic.id}
                      onPress={() => toggleTopic(topic.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.chip, { backgroundColor }, { borderColor }]}
                    >
                      <Text style={[styles.chipLabel, { color: labelColor }]}>{topic.label}</Text>
                      {selected ? (
                        <View style={[styles.chipCheck, { backgroundColor: borderColor }]}>
                          <Text style={styles.chipCheckGlyph}>{'✓'}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.spacer} />

          {tooltipMounted ? (
            <Animated.View style={[styles.tooltip, { opacity: tooltipOpacity }]}>
              <Text style={styles.tooltipText}>Select at least one topic</Text>
            </Animated.View>
          ) : null}

          <Text style={styles.pickedCount}>
            {selectedIds.length} picked · choose as many as you like
          </Text>

          <PrimaryButton variant="action" label="Find someone" onPress={handleFindSomeone} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const TOGGLE_TRACK_WIDTH = 50;
const TOGGLE_THUMB_SIZE = 23;
const TOGGLE_PADDING = 3;
const TOGGLE_TRAVEL = TOGGLE_TRACK_WIDTH - TOGGLE_THUMB_SIZE - TOGGLE_PADDING * 2;

function OptInToggle({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [value, progress]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, TOGGLE_TRAVEL] });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel="Help someone lift their mood"
      style={[styles.toggleTrack, value ? styles.toggleTrackOn : styles.toggleTrackOff]}
    >
      <Animated.View
        style={[
          styles.toggleThumb,
          value ? styles.toggleThumbOn : styles.toggleThumbOff,
          { transform: [{ translateX }] },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.gradientBackground[0],
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 26,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headline: {
    flex: 1,
  },
  mascot: {
    width: 84,
    height: 88,
    marginLeft: 12,
  },
  subtitle: {
    marginTop: 8,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.body,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 26,
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.white,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 11,
    elevation: 3,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconGlyph: {
    fontSize: 16,
  },
  infoTextColumn: {
    flex: 1,
    marginLeft: 13,
  },
  infoTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.ink,
  },
  infoSubtitle: {
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    marginTop: 4,
  },
  toggleTrack: {
    width: TOGGLE_TRACK_WIDTH,
    height: 29,
    borderRadius: 15,
    padding: TOGGLE_PADDING,
    marginLeft: 12,
    borderWidth: 1,
  },
  toggleTrackOn: {
    backgroundColor: colors.bubblePink,
    borderColor: colors.bubblePink,
  },
  toggleTrackOff: {
    backgroundColor: colors.white,
    borderColor: colors.progressTrackInactive,
  },
  toggleThumb: {
    width: TOGGLE_THUMB_SIZE,
    height: TOGGLE_THUMB_SIZE,
    borderRadius: TOGGLE_THUMB_SIZE / 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 2,
  },
  toggleThumbOn: {
    backgroundColor: colors.white,
  },
  toggleThumbOff: {
    backgroundColor: colors.bubblePink,
  },
  chipGrid: {
    marginTop: 20,
    gap: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 12,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 58,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 2,
  },
  chipLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12.7,
  },
  chipCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCheckGlyph: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.white,
  },
  spacer: {
    flex: 1,
  },
  tooltip: {
    alignSelf: 'center',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.white,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  tooltipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12.5,
    color: colors.warning,
  },
  pickedCount: {
    marginBottom: 20,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 12.5,
    color: colors.body,
  },
});

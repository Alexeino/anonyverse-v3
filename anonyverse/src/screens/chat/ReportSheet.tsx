import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, radii, typography } from '../../design/tokens';
import type { ReportType } from '../../services/report/types';

const REASONS: { type: ReportType; label: string }[] = [
  { type: 'harassment', label: 'Harassment' },
  { type: 'sexual_content', label: 'Sexual content' },
  { type: 'hate_speech', label: 'Hate speech' },
  { type: 'threat', label: 'Threats' },
  { type: 'scam_or_spam', label: 'Spam or scam' },
  { type: 'other', label: 'Something else' },
];

const WHAT_HAPPENS_NEXT = [
  'The chat is reviewed automatically — no human reads it unless flagged.',
  "If it's valid, their standing is affected. False reports affect yours.",
  'You two will never be matched again either way.',
];

export const MAX_REPORT_DESCRIPTION_LENGTH = 500;

const SLIDE_OFFSET = Dimensions.get('window').height;

export interface ReportSheetProps {
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (reportType: ReportType, description?: string) => void;
}

/**
 * "Report this person" slide-up sheet (Figma: Reporting User). Picking a
 * reason and tapping "Report & leave" reports the partner, then leaves the
 * chat for a new match whether or not the report went through.
 */
export function ReportSheet({ submitting, onDismiss, onSubmit }: ReportSheetProps) {
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [description, setDescription] = useState('');
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SLIDE_OFFSET)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scrimOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 60 }),
    ]).start();
  }, [scrimOpacity, translateY]);

  const handleClose = () => {
    if (submitting || closingRef.current) {
      return;
    }
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(scrimOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: SLIDE_OFFSET, duration: 220, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  const handleSubmit = () => {
    if (!reportType || submitting) {
      return;
    }
    onSubmit(reportType, reportType === 'other' ? description : undefined);
  };

  const canSubmit = reportType !== null && !submitting;

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrimOpacity }]}>
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="light"
          blurAmount={4}
          reducedTransparencyFallbackColor={colors.gradientBackground[0]}
        />
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close report"
        />
      </Animated.View>

      <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoider} pointerEvents="box-none">
        <Animated.View
          style={[styles.sheet, { marginTop: insets.top + 24, transform: [{ translateY }] }]}
          accessibilityViewIsModal
        >
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 22) + 8 }]}
          >
            <View style={styles.handle} />

            <View style={styles.headerRow}>
              <View style={styles.flagTile}>
                <Text style={styles.flagGlyph}>{'⚑'}</Text>
              </View>
              <Text style={styles.title} accessibilityRole="header">
                Report this person
              </Text>
            </View>

            <Text style={styles.subtitle}>What happened? This helps us keep Anonyverse safe for everyone.</Text>

            <View style={styles.chips} accessibilityRole="radiogroup">
              {REASONS.map(reason => {
                const selected = reason.type === reportType;
                return (
                  <Pressable
                    key={reason.type}
                    onPress={() => setReportType(reason.type)}
                    disabled={submitting}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: submitting }}
                    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{reason.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {reportType === 'other' ? (
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Tell us what happened (optional)"
                placeholderTextColor={colors.inkMuted}
                style={styles.descriptionInput}
                multiline
                maxLength={MAX_REPORT_DESCRIPTION_LENGTH}
                editable={!submitting}
                textAlignVertical="top"
                accessibilityLabel="Describe what happened"
              />
            ) : null}

            <View style={styles.infoPanel}>
              <Text style={styles.infoTitle}>What happens next</Text>
              {WHAT_HAPPENS_NEXT.map((line, index) => (
                <View key={line} style={styles.infoRow}>
                  <Text style={styles.infoNumber}>{index + 1}</Text>
                  <Text style={styles.infoText}>{line}</Text>
                </View>
              ))}
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                onPress={handleClose}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: submitting }}
                style={({ pressed }) => [styles.cancelButton, submitting && styles.disabled, pressed && styles.pressed]}
              >
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Report and leave"
                accessibilityState={{ disabled: !canSubmit, busy: submitting }}
                style={({ pressed }) => [
                  styles.reportButton,
                  reportType === null && styles.disabled,
                  pressed && canSubmit && styles.pressed,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.reportLabel}>Report & leave</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  scrim: {
    backgroundColor: colors.sheetScrim,
  },
  keyboardAvoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    shadowColor: colors.sheetShadow,
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingTop: 26,
  },
  handle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.progressTrackInactive,
  },
  headerRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flagTile: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerBadgeBackground,
  },
  flagGlyph: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.danger,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 12,
    fontFamily: fontFamily.regular,
    fontSize: 14.5,
    lineHeight: 21.75,
    color: colors.body,
  },
  chips: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chip: {
    height: 45,
    paddingHorizontal: 17,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    backgroundColor: colors.softChipBackground,
  },
  chipSelected: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBadgeBackground,
  },
  chipLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 13.5,
    color: colors.softChipText,
  },
  chipLabelSelected: {
    color: colors.danger,
  },
  descriptionInput: {
    marginTop: 14,
    minHeight: 80,
    maxHeight: 140,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.softChipBackground,
    fontFamily: typography.bubble.fontFamily,
    fontSize: 14,
    color: colors.ink,
  },
  infoPanel: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderRadius: 20,
    backgroundColor: colors.infoPanelBackground,
  },
  infoTitle: {
    marginBottom: 10,
    fontFamily: fontFamily.bold,
    fontSize: 13.5,
    color: colors.ink,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 8,
  },
  infoNumber: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    lineHeight: 19.58,
    color: colors.ink,
  },
  infoText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13.5,
    lineHeight: 19.58,
    color: colors.body,
  },
  buttonRow: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 11,
  },
  cancelButton: {
    flex: 144,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.disabledButtonBackground,
  },
  cancelLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.softChipText,
  },
  reportButton: {
    flex: 191,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    shadowColor: colors.dangerButtonShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 11,
    elevation: 4,
  },
  reportLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.white,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});

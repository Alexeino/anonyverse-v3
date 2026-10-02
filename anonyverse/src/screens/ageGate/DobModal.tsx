import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton/PrimaryButton';
import { colors, fontFamily } from '../../design/tokens';
import {
  isValidBirthDate,
  MIN_BIRTH_YEAR,
  toCalendarDate,
  type CalendarDate,
} from '../../services/ageGate/ageRules';
import { AgeModalShell } from './AgeModalShell';
import { WheelPicker, type WheelOption } from './WheelPicker';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EMPTY: WheelOption = { label: '—', value: null };

const DAY_OPTIONS: WheelOption[] = [
  EMPTY,
  ...Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), value: i + 1 })),
];

const MONTH_OPTIONS: WheelOption[] = [EMPTY, ...MONTHS.map((label, i) => ({ label, value: i + 1 }))];

function yearOptions(currentYear: number): WheelOption[] {
  return [
    EMPTY,
    ...Array.from({ length: currentYear - MIN_BIRTH_YEAR + 1 }, (_, i) => {
      const year = currentYear - i;
      return { label: String(year), value: year };
    }),
  ];
}

const defaultNow = () => new Date();

export interface DobModalProps {
  onConfirm: (dob: CalendarDate) => void;
  now?: () => Date;
}

export function DobModal({ onConfirm, now = defaultNow }: DobModalProps) {
  const today = toCalendarDate(now());
  const years = useMemo(() => yearOptions(today.year), [today.year]);
  const [day, setDay] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);

  const dob = day !== null && month !== null && year !== null ? { year, month, day } : null;
  const valid = dob !== null && isValidBirthDate(dob, today);

  const handleConfirm = () => {
    if (!dob || !valid || submittedRef.current) {
      return;
    }
    submittedRef.current = true;
    setSubmitted(true);
    onConfirm(dob);
  };

  return (
    <AgeModalShell>
      <Text style={styles.title}>{"When's your\nbirthday?"}</Text>
      <Text style={styles.subtitle}>We use it once to check you can use Anonyverse. It stays on your phone.</Text>

      <View style={styles.wheels}>
        <WheelPicker label="Day" options={DAY_OPTIONS} value={day} onChange={setDay} />
        <WheelPicker label="Month" options={MONTH_OPTIONS} value={month} onChange={setMonth} />
        <WheelPicker label="Year" options={years} value={year} onChange={setYear} />
      </View>

      <Text style={[styles.hint, dob && !valid && styles.hintError]} accessibilityLiveRegion="polite">
        {dob && !valid ? "That date doesn't exist." : "Double-check it — you can't change it later."}
      </Text>

      <View style={styles.button}>
        {submitted ? (
          <PrimaryButton variant="loading" label="One moment…" />
        ) : valid ? (
          <PrimaryButton variant="action" label="Continue" onPress={handleConfirm} />
        ) : (
          <PrimaryButton variant="disabled" label="Continue" />
        )}
      </View>
    </AgeModalShell>
  );
}

const styles = StyleSheet.create({
  title: {
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
  wheels: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
  },
  hint: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 12.5,
    color: colors.inkMuted,
  },
  hintError: {
    color: colors.danger,
  },
  button: {
    marginTop: 18,
    alignSelf: 'stretch',
  },
});

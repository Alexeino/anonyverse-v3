export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export const MIN_AGE = 18;
export const MIN_BIRTH_YEAR = 1900;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function toCalendarDate(date: Date): CalendarDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export function isValidBirthDate(dob: CalendarDate, today: CalendarDate): boolean {
  const { year, month, day } = dob;
  if (![year, month, day].every(Number.isInteger)) {
    return false;
  }
  if (year < MIN_BIRTH_YEAR || month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return false;
  }
  return compareDates(dob, today) <= 0;
}

// 18 years after a leap year is never a leap year, so 29 Feb becomes 1 Mar.
export function eighteenthBirthday(dob: CalendarDate): CalendarDate {
  const year = dob.year + MIN_AGE;
  if (dob.month === 2 && dob.day === 29 && !isLeapYear(year)) {
    return { year, month: 3, day: 1 };
  }
  return { year, month: dob.month, day: dob.day };
}

export function isAdult(dob: CalendarDate, today: CalendarDate): boolean {
  return compareDates(today, eighteenthBirthday(dob)) >= 0;
}

export function isLockActive(lockUntil: CalendarDate, today: CalendarDate): boolean {
  return compareDates(today, lockUntil) < 0;
}

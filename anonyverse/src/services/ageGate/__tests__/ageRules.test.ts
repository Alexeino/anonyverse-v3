import {
  addYears,
  compareDates,
  eighteenthBirthday,
  isAdult,
  isLockActive,
  isValidBirthDate,
  toCalendarDate,
  type CalendarDate,
} from '../ageRules';

const TODAY: CalendarDate = { year: 2026, month: 10, day: 1 };

function date(year: number, month: number, day: number): CalendarDate {
  return { year, month, day };
}

describe('isAdult', () => {
  it('is true on the 18th birthday', () => {
    expect(isAdult(date(2008, 10, 1), TODAY)).toBe(true);
  });

  it('is false the day before the 18th birthday', () => {
    expect(isAdult(date(2008, 10, 2), TODAY)).toBe(false);
  });

  it('is true well past 18', () => {
    expect(isAdult(date(1990, 5, 20), TODAY)).toBe(true);
  });

  it('treats someone born on 29 Feb as 18 on 1 Mar in a non-leap year', () => {
    expect(isAdult(date(2008, 2, 29), date(2026, 2, 28))).toBe(false);
    expect(isAdult(date(2008, 2, 29), date(2026, 3, 1))).toBe(true);
  });
});

describe('addYears', () => {
  it('adds whole years', () => {
    expect(addYears(date(2026, 10, 1), 1)).toEqual(date(2027, 10, 1));
  });

  it('moves 29 Feb to 1 Mar in a non-leap year', () => {
    expect(addYears(date(2028, 2, 29), 1)).toEqual(date(2029, 3, 1));
  });

  it('keeps 29 Feb in a leap year', () => {
    expect(addYears(date(2024, 2, 29), 4)).toEqual(date(2028, 2, 29));
  });
});

describe('eighteenthBirthday', () => {
  it('adds 18 years', () => {
    expect(eighteenthBirthday(date(2010, 3, 12))).toEqual(date(2028, 3, 12));
  });

  it('moves 29 Feb to 1 Mar', () => {
    expect(eighteenthBirthday(date(2008, 2, 29))).toEqual(date(2026, 3, 1));
  });
});

describe('isValidBirthDate', () => {
  it('accepts a real past date', () => {
    expect(isValidBirthDate(date(1999, 12, 31), TODAY)).toBe(true);
  });

  it('accepts 29 Feb in a leap year', () => {
    expect(isValidBirthDate(date(2000, 2, 29), TODAY)).toBe(true);
  });

  it.each([
    ['31 Feb', date(2000, 2, 31)],
    ['29 Feb in a non-leap year', date(2001, 2, 29)],
    ['31 Apr', date(2000, 4, 31)],
    ['a year before 1900', date(1899, 1, 1)],
    ['tomorrow', date(2026, 10, 2)],
  ])('rejects %s', (_label, dob) => {
    expect(isValidBirthDate(dob, TODAY)).toBe(false);
  });
});

describe('isLockActive', () => {
  it('is active before the unlock date', () => {
    expect(isLockActive(date(2026, 10, 2), TODAY)).toBe(true);
  });

  it('lifts on the unlock date', () => {
    expect(isLockActive(TODAY, TODAY)).toBe(false);
  });
});

describe('compareDates / toCalendarDate', () => {
  it('orders by year, then month, then day', () => {
    expect(compareDates(date(2025, 12, 31), date(2026, 1, 1))).toBeLessThan(0);
    expect(compareDates(TODAY, TODAY)).toBe(0);
  });

  it('uses a 1-based month', () => {
    expect(toCalendarDate(new Date(2026, 0, 15))).toEqual(date(2026, 1, 15));
  });
});

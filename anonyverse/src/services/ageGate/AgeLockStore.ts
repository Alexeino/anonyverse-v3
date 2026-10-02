import type { CalendarDate } from './ageRules';


export interface AgeLockStore {
  getLockUntil(): Promise<CalendarDate | null>;
  setLockUntil(date: CalendarDate): Promise<void>;
  clearLock(): Promise<void>;
}

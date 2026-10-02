import EncryptedStorage from 'react-native-encrypted-storage';
import type { AgeLockStore } from './AgeLockStore';
import type { CalendarDate } from './ageRules';

const LOCK_UNTIL_KEY = 'anonyverse.age_lock_until';

const pad = (value: number, length: number) => String(value).padStart(length, '0');

function formatDate({ year, month, day }: CalendarDate): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function parseDate(raw: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    return null;
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export const secureAgeLockStore: AgeLockStore = {
  async getLockUntil() {
    try {
      const raw = await EncryptedStorage.getItem(LOCK_UNTIL_KEY);
      return raw ? parseDate(raw) : null;
    } catch {
      return null;
    }
  },

  async setLockUntil(date) {
    try {
      await EncryptedStorage.setItem(LOCK_UNTIL_KEY, formatDate(date));
    } catch {}
  },

  async clearLock() {
    try {
      await EncryptedStorage.removeItem(LOCK_UNTIL_KEY);
    } catch {}
  },
};

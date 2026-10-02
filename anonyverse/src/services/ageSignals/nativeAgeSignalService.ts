import { Platform } from 'react-native';
import { getAgeRange, isSupported, type AgeSignalResult } from 'react-native-age-signals';
import type { AgeSignalService, OsAgeAnswer } from './AgeSignalService';

// Android only: Play can hang without Play Services. iOS waits for the user on Apple's sheet.
export const ANDROID_TIMEOUT_MS = 8000;

export function toOsAgeAnswer(result: AgeSignalResult): OsAgeAnswer {
  if (result.ageRange === 'adult') {
    return 'adult';
  }
  if (result.ageRange === 'teen' || result.ageRange === 'child') {
    return 'minor';
  }
  return 'unknown';
}

export const nativeAgeSignalService: AgeSignalService = {
  async showsSystemSheet() {
    if (Platform.OS !== 'ios') {
      return false;
    }
    try {
      return await isSupported();
    } catch {
      return false;
    }
  },

  async check() {
    const read = getAgeRange({ requestAccess: true }).then(toOsAgeAnswer, (): OsAgeAnswer => 'unknown');
    if (Platform.OS === 'ios') {
      return read;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<OsAgeAnswer>(resolve => {
      timer = setTimeout(() => resolve('unknown'), ANDROID_TIMEOUT_MS);
    });
    try {
      return await Promise.race([read, timeout]);
    } finally {
      clearTimeout(timer);
    }
  },
};

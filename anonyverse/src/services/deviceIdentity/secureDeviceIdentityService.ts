import EncryptedStorage from 'react-native-encrypted-storage';
import type { DeviceIdentityService } from './DeviceIdentityService';

const DEVICE_ID_KEY = 'anonyverse.device_id';

/**
 * react-native-encrypted-storage-backed implementation.
 * iOS: Keychain. Android: EncryptedSharedPreferences.
 *
 * This is the bare-RN equivalent of the expo-secure-store usage in the
 * previous app (anonyverse-v2). Not specified in
 * docs/architecture.md's recommended stack — flagged as an added
 * dependency in the Entry screen implementation report.
 */
export const secureDeviceIdentityService: DeviceIdentityService = {
  async getDeviceId() {
    try {
      const value = await EncryptedStorage.getItem(DEVICE_ID_KEY);
      return value ?? null;
    } catch {
      return null;
    }
  },

  async setDeviceId(deviceId: string) {
    await EncryptedStorage.setItem(DEVICE_ID_KEY, deviceId);
  },

  async clearDeviceId() {
    await EncryptedStorage.removeItem(DEVICE_ID_KEY);
  },
};

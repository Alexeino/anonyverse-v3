/**
 * Abstraction over secure, on-device persistence of the Anonyverse device
 * identity. Screens/hooks must depend on this interface, never on a
 * concrete storage library, so the backing implementation can change
 * without touching presentation code.
 */
export interface DeviceIdentityService {
  /** Returns the persisted device ID, or null if this device has never been verified. */
  getDeviceId(): Promise<string | null>;

  /** Persists the device ID returned by the backend after verification. */
  setDeviceId(deviceId: string): Promise<void>;

  /** Clears the persisted device ID (e.g. on logout/device revocation, once that exists). */
  clearDeviceId(): Promise<void>;
}

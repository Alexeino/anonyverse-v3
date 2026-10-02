import { Platform } from 'react-native';
import { getAgeRange, isSupported } from 'react-native-age-signals';
import { ANDROID_TIMEOUT_MS, nativeAgeSignalService, toOsAgeAnswer } from '../nativeAgeSignalService';

const mockedGetAgeRange = getAgeRange as jest.Mock;
const mockedIsSupported = isSupported as jest.Mock;

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

describe('toOsAgeAnswer', () => {
  it.each([
    ['adult', 'adult'],
    ['teen', 'minor'],
    ['child', 'minor'],
    ['unknown', 'unknown'],
  ] as const)('maps %s to %s', (ageRange, expected) => {
    expect(toOsAgeAnswer({ ageRange, source: 'google' })).toBe(expected);
  });
});

describe('nativeAgeSignalService', () => {
  afterEach(() => {
    jest.useRealTimers();
    setPlatform('android');
  });

  it('asks Play for sharing access when reading the age', async () => {
    setPlatform('android');
    mockedGetAgeRange.mockResolvedValueOnce({ ageRange: 'adult', source: 'google' });

    await expect(nativeAgeSignalService.check()).resolves.toBe('adult');
    expect(mockedGetAgeRange).toHaveBeenCalledWith({ requestAccess: true });
  });

  it('treats a failed read as unknown', async () => {
    setPlatform('android');
    mockedGetAgeRange.mockRejectedValueOnce(new Error('boom'));

    await expect(nativeAgeSignalService.check()).resolves.toBe('unknown');
  });

  it('gives up on Android after the timeout', async () => {
    jest.useFakeTimers();
    setPlatform('android');
    mockedGetAgeRange.mockImplementationOnce(() => new Promise(() => {}));

    const answer = nativeAgeSignalService.check();
    jest.advanceTimersByTime(ANDROID_TIMEOUT_MS);

    await expect(answer).resolves.toBe('unknown');
  });

  it('only reports a system sheet on iOS when the API is available', async () => {
    setPlatform('android');
    await expect(nativeAgeSignalService.showsSystemSheet()).resolves.toBe(false);

    setPlatform('ios');
    mockedIsSupported.mockResolvedValueOnce(true);
    await expect(nativeAgeSignalService.showsSystemSheet()).resolves.toBe(true);

    mockedIsSupported.mockRejectedValueOnce(new Error('boom'));
    await expect(nativeAgeSignalService.showsSystemSheet()).resolves.toBe(false);
  });
});

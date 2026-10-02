import EncryptedStorage from 'react-native-encrypted-storage';
import { secureAgeLockStore } from '../secureAgeLockStore';

const getItem = EncryptedStorage.getItem as unknown as jest.Mock;
const setItem = EncryptedStorage.setItem as unknown as jest.Mock;
const removeItem = EncryptedStorage.removeItem as unknown as jest.Mock;

afterEach(() => {
  jest.clearAllMocks();
  getItem.mockReset();
  getItem.mockResolvedValue(null);
});

describe('secureAgeLockStore', () => {
  it('saves the unlock date as YYYY-MM-DD', async () => {
    await secureAgeLockStore.setLockUntil({ year: 2030, month: 3, day: 1 });

    expect(setItem).toHaveBeenCalledWith('anonyverse.age_lock_until', '2030-03-01');
  });

  it('reads a saved unlock date back', async () => {
    getItem.mockResolvedValueOnce('2030-03-01');

    await expect(secureAgeLockStore.getLockUntil()).resolves.toEqual({ year: 2030, month: 3, day: 1 });
  });

  it('returns null when there is no lock', async () => {
    await expect(secureAgeLockStore.getLockUntil()).resolves.toBeNull();
  });

  it('treats a corrupt value as no lock', async () => {
    getItem.mockResolvedValueOnce('not-a-date');

    await expect(secureAgeLockStore.getLockUntil()).resolves.toBeNull();
  });

  it('treats unreadable storage as no lock', async () => {
    getItem.mockRejectedValueOnce(new Error('keystore unavailable'));

    await expect(secureAgeLockStore.getLockUntil()).resolves.toBeNull();
  });

  it('clears the lock', async () => {
    await secureAgeLockStore.clearLock();

    expect(removeItem).toHaveBeenCalledWith('anonyverse.age_lock_until');
  });

  it('does not throw when saving fails', async () => {
    setItem.mockRejectedValueOnce(new Error('keystore unavailable'));

    await expect(secureAgeLockStore.setLockUntil({ year: 2030, month: 3, day: 1 })).resolves.toBeUndefined();
  });
});

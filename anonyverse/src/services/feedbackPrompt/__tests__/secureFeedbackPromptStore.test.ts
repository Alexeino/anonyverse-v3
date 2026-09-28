import EncryptedStorage from 'react-native-encrypted-storage';
import { secureFeedbackPromptStore } from '../secureFeedbackPromptStore';

const getItem = EncryptedStorage.getItem as unknown as jest.Mock;

describe('secureFeedbackPromptStore.load', () => {
  afterEach(() => {
    getItem.mockReset();
    getItem.mockResolvedValue(null);
  });

  it('reads states saved before the first-skip flag existed', async () => {
    getItem.mockResolvedValueOnce(
      JSON.stringify({ firstChatPromptShown: true, lastShownAt: 5, dismissalsInARow: 1, lastSubmittedAt: null }),
    );

    await expect(secureFeedbackPromptStore.load()).resolves.toEqual({
      firstChatPromptShown: true,
      firstSkipPromptShown: false,
      lastShownAt: 5,
      dismissalsInARow: 1,
      lastSubmittedAt: null,
    });
  });

  it('carries over the first-chat flag written by older versions', async () => {
    getItem.mockResolvedValueOnce(null).mockResolvedValueOnce('true');

    await expect(secureFeedbackPromptStore.load()).resolves.toMatchObject({ firstChatPromptShown: true });
  });

  it('returns null when storage cannot be read, so no automatic prompt shows', async () => {
    getItem.mockRejectedValueOnce(new Error('keystore unavailable'));

    await expect(secureFeedbackPromptStore.load()).resolves.toBeNull();
  });
});

import { Platform } from 'react-native';
import { ApiError, postJson } from '../api/httpClient';
import type { FeedbackService } from './FeedbackService';
import type { FeedbackRequest, FeedbackResponse } from './types';

/**
 * fetch-backed implementation of FeedbackService, calling
 * POST /api/v1/feedback (see docs/api.md). platform and app_version are
 * copied server-side from the device record, so only os_version is sent.
 */
export const restFeedbackService: FeedbackService = {
  async submit(submission, accessToken) {
    const request: FeedbackRequest = {
      type: submission.type,
      message: submission.message,
      rating: submission.rating,
      screen: submission.screen,
      // Platform.Version is a number on Android (API level) and a string on iOS.
      os_version: String(Platform.Version),
    };

    try {
      const response = await postJson<FeedbackResponse>('/api/v1/feedback', request, {
        accessToken,
      });
      return { status: 'submitted', id: response.id };
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.status) {
          case 401:
            return { status: 'unauthorized' };
          case 403:
            return { status: 'blocked' };
          case 422:
            return { status: 'invalid' };
          case 429:
            return { status: 'rate_limited' };
        }
      }
      return { status: 'failed', error };
    }
  },
};

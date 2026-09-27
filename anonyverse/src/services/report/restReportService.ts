import { ApiError, postJson } from '../api/httpClient';
import type { ReportService } from './ReportService';
import type { ReportUserRequest, ReportUserResponse } from './types';

// Per attempt. The chat re-joins only once the report is done, and end_chat
// keeps the reported pair apart for just 20s, so every attempt plus the
// backoff between them (REPORT_RETRY_DELAYS_MS in useChatController) must
// finish within it.
const REPORT_TIMEOUT_MS = 5_000;

/**
 * fetch-backed implementation of ReportService, calling the REST contract
 * documented in docs/api.md.
 */
export const restReportService: ReportService = {
  async reportUser({ accessToken, reportedUserSid, reportType, description }) {
    const trimmedDescription = description?.trim();
    const request: ReportUserRequest = {
      reported_user_sid: reportedUserSid,
      ...(reportType ? { report_type: reportType } : {}),
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    };

    try {
      const response = await postJson<ReportUserResponse>('/api/v1/report/report-user', request, {
        accessToken,
        timeoutMs: REPORT_TIMEOUT_MS,
      });
      return { status: 'reported', reportId: response.report_id };
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined;
      switch (status) {
        case 401:
          return { status: 'unauthorized' };
        case 404:
          return { status: 'nothing_to_report' };
        case 422:
          return { status: 'failed', retryable: false, error };
        default:
          // 5xx, or no status at all (network failure).
          return { status: 'failed', retryable: status === undefined || status >= 500, error };
      }
    }
  },
};

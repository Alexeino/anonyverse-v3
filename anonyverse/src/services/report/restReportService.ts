import { ApiError, postJson } from '../api/httpClient';
import type { ReportService } from './ReportService';
import type { ReportUserRequest, ReportUserResponse } from './types';

/**
 * fetch-backed implementation of ReportService, calling the REST contract
 * documented in docs/api.md.
 */
export const restReportService: ReportService = {
  async reportUser({ accessToken, reportType, description, reportingUserSid }) {
    const trimmedDescription = description?.trim();
    const request: ReportUserRequest = {
      token: accessToken,
      report_type: reportType,
      reporting_user_sid: reportingUserSid,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    };

    try {
      const response = await postJson<ReportUserResponse>('/api/v1/report/report-user', request);
      return { status: 'reported', reportId: response.report_id };
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined;
      switch (status) {
        case 401:
          return { status: 'unauthorized' };
        case 403:
          return { status: 'sid_rejected' };
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

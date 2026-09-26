/**
 * `report_type` values for POST /api/v1/report/report-user (docs/api.md).
 * `sexual_content` is pending on the backend — rejected with 422 until it ships.
 */
export type ReportType = 'harassment' | 'sexual_content' | 'hate_speech' | 'threat' | 'scam_or_spam' | 'other';

export interface ReportUserRequest {
  token: string;
  report_type: ReportType;
  description?: string | null;
  reporting_user_sid: string;
}

export interface ReportUserResponse {
  report_id: string;
  report_type: ReportType;
}

export interface ReportUserParams {
  accessToken: string;
  reportType: ReportType;
  description?: string | null;
  /** Our own socket.id for the current connection — not the partner's. */
  reportingUserSid: string;
}

export type ReportOutcome =
  | { status: 'reported'; reportId: string }
  /** 401 — the access token was expired/invalid; refresh and retry. */
  | { status: 'unauthorized' }
  /** 403 — reporting_user_sid isn't a live connection of this device. */
  | { status: 'sid_rejected' }
  /** 404 — not in a chat and not skipped in the last 5 minutes. */
  | { status: 'nothing_to_report' }
  /** Anything else (422, 5xx, network) — 5xx/network are worth retrying. */
  | { status: 'failed'; retryable: boolean; error?: unknown };

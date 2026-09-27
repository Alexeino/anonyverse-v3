/** `report_type` values for POST /api/v1/report/report-user (docs/api.md). */
export type ReportType = 'harassment' | 'hate_speech' | 'threat' | 'scam_or_spam' | 'other';

export interface ReportUserRequest {
  reported_user_sid: string;
  /** Omitted for one-tap reports, which don't ask for a reason. */
  report_type?: ReportType;
  description?: string | null;
}

export interface ReportUserResponse {
  report_id: string;
  report_type: ReportType | null;
}

export interface ReportUserParams {
  accessToken: string;
  /** The partner's sid from `match_found` for the chat being reported. */
  reportedUserSid: string;
  /** Omitted for one-tap reports, which don't ask for a reason. */
  reportType?: ReportType;
  description?: string | null;
}

export type ReportOutcome =
  | { status: 'reported'; reportId: string }
  /** 401 — the access token was expired/invalid; refresh and retry. */
  | { status: 'unauthorized' }
  /**
   * 404 — that sid isn't the partner of our last ended chat: the chat is
   * still active, a newer chat has ended since, the 5-minute window passed,
   * or it was already reported (by either side).
   */
  | { status: 'nothing_to_report' }
  /** Anything else (422, 5xx, network) — 5xx/network are worth retrying. */
  | { status: 'failed'; retryable: boolean; error?: unknown };

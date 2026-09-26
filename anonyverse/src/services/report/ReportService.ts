import type { ReportOutcome, ReportUserParams } from './types';

/** Abstraction over the report REST call, so screens/hooks never call fetch directly. */
export interface ReportService {
  /**
   * POST /api/v1/report/report-user — the server works out who is reported
   * from our chat state, so this must go out *before* skip_chat/end_chat.
   */
  reportUser(params: ReportUserParams): Promise<ReportOutcome>;
}

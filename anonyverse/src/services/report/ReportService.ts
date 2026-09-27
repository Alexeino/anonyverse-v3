import type { ReportOutcome, ReportUserParams } from './types';

/** Abstraction over the report REST call, so screens/hooks never call fetch directly. */
export interface ReportService {
  /**
   * POST /api/v1/report/report-user — reports the partner of our last ended
   * chat, named by its sid. A live chat must be ended (end_chat acked) first.
   */
  reportUser(params: ReportUserParams): Promise<ReportOutcome>;
}

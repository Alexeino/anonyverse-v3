import type { ReportService } from './ReportService';

/** A ReportService that talks to nothing — for the DEV Menu's Chat preview, which has no real partner to report. */
export const devNoopReportService: ReportService = {
  reportUser: params => {
    console.log('[DevChat] reportUser (no-op, nothing is listening):', params.reportType ?? '(no reason)');
    return Promise.resolve({ status: 'reported', reportId: 'dev-report' });
  },
};

export type OsAgeAnswer = 'adult' | 'minor' | 'unknown';

export interface AgeSignalService {
  /** True when the check shows Apple's age-sharing sheet, so the app explains it first. */
  showsSystemSheet(): Promise<boolean>;
  /** Never rejects: no answer, a refusal or a failure is 'unknown'. */
  check(): Promise<OsAgeAnswer>;
}

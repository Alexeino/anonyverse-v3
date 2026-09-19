import { POSTHOG_PROJECT_TOKEN } from '@env';
import PostHog from 'posthog-react-native';

// Not per-environment config — every build ships to the same PostHog
// project, so this is a constant rather than an env var.
const POSTHOG_HOST = 'https://eu.i.posthog.com';

if (!POSTHOG_PROJECT_TOKEN) {
  console.error(
    '[posthog] POSTHOG_PROJECT_TOKEN is not set — check your .env file. Analytics events will not be sent.',
  );
}

export const posthog = POSTHOG_PROJECT_TOKEN
  ? new PostHog(POSTHOG_PROJECT_TOKEN, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: false,
    })
  : undefined;

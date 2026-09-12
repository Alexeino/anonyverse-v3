import { API_BASE_URL, SITE_KEY } from '@env';

/**
 * App configuration sourced from .env (see .env.example). Values are
 * inlined at build time by react-native-dotenv (babel.config.js), which is
 * configured with `safe: true` so a build fails loudly if .env is missing
 * entirely — but an individual variable can still resolve to an empty
 * string if it's declared but left blank, which these guards catch too.
 */
if (!API_BASE_URL) {
  console.error('[env] API_BASE_URL is not set — check your .env file. API requests will fail.');
}
if (!SITE_KEY) {
  console.error('[env] SITE_KEY is not set — check your .env file. Turnstile verification will not work.');
}

export const env = {
  apiBaseUrl: API_BASE_URL,
  turnstileSiteKey: SITE_KEY,
} as const;

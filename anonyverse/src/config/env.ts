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

/**
 * Whether it's safe to send credentials to `url`. Every request carries a
 * credential (the refresh token on /jwt/refresh, the access token on the
 * socket handshake), so a non-https:// base URL fails closed in
 * production. In development plain http:// is allowed, with a warning, but
 * only to a local host (loopback, the Android emulator's 10.0.2.2, or a
 * private LAN address for a physical device) — a public host still needs
 * https://, so a misconfigured staging URL can't leak tokens.
 */
export function isApiBaseUrlSecure(
  url: string = env.apiBaseUrl,
  isDev: boolean = __DEV__,
): boolean {
  if (/^https:\/\//.test(url)) {
    return true;
  }
  if (isDev && isLocalHttpUrl(url)) {
    console.warn(
      '[env] API_BASE_URL is not https:// — tokens will be sent in cleartext. Only use this against a trusted local backend.',
    );
    return true;
  }
  console.error(
    isDev
      ? '[env] Refusing to send requests — a non-local API_BASE_URL must use https://, even in development, so tokens are never sent in cleartext.'
      : '[env] Refusing to send requests — API_BASE_URL must use https:// in production so tokens are never sent in cleartext.',
  );
  return false;
}

function isLocalHttpUrl(url: string): boolean {
  const authority = /^http:\/\/([^/?#]*)/i.exec(url)?.[1];
  // Userinfo (`localhost:@evil.com`) would make the host before `:` differ
  // from the one fetch connects to, so any `@` (or `\`) fails closed.
  if (!authority || /[@\\]/.test(authority)) {
    return false;
  }
  const host = authority.split(':')[0].toLowerCase();
  return (
    host === 'localhost' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

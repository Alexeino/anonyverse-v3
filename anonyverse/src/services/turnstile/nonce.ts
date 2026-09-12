/**
 * Generates a per-mount replay guard for the Turnstile WebView bridge.
 * Not a secret — see useTurnstile.ts for why it doesn't need to stay
 * confidential — but it does need to be unpredictable: it's the only
 * guard against forged postMessage events from hostile code that might
 * run inside the WebView, so it's drawn from a CSPRNG (via
 * react-native-get-random-values' crypto.getRandomValues polyfill, loaded
 * in index.js) rather than Math.random(), whose output is predictable
 * given enough prior samples.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const timestamp = Date.now().toString(36);
  return `${timestamp}-${random}`;
}

import { useCallback, useMemo, useRef, useState } from 'react';
import type { WebViewMessageEvent } from 'react-native-webview';
import { generateNonce } from './nonce';
import { buildTurnstileHtml } from './turnstileTemplate';

interface TurnstileMessage {
  type:
    | 'turnstile_success'
    | 'turnstile_error'
    | 'turnstile_expire'
    | 'turnstile_before_interactive'
    | 'turnstile_after_interactive';
  nonce: string;
  token?: string;
  error?: string;
}

export interface UseTurnstileResult {
  /** The local HTML page to load into the WebView via source={{ html }}. */
  html: string;
  /** Set once Cloudflare's callback fires with a passed challenge token. */
  token: string | null;
  /** Set on the widget's own error callback (network/config issues, not a failed backend verify). */
  error: string | null;
  /** True between before_interactive and after_interactive — show the checkbox card. */
  needsInteraction: boolean;
  handleMessage: (event: WebViewMessageEvent) => void;
  /** Clears local token/error state after a failed backend verify, so a fresh success can be processed. */
  reset: () => void;
}

/**
 * Bridges the Cloudflare Turnstile widget running inside a WebView back to
 * RN state via postMessage. See turnstileTemplate.ts for the page itself.
 *
 * Nonce security note: the nonce isn't a secret — it's a replay guard.
 * originWhitelist on the WebView only restricts navigation, not who can
 * call the postMessage bridge, so any JS that ends up running in the
 * WebView (a hostile sub-frame, injected content) could otherwise forge a
 * turnstile_success message with an arbitrary token. Because the nonce is
 * generated fresh per mount and only ever lives inside this page's own JS
 * scope, a foreign script can't reproduce it, so messages with a
 * mismatched (or missing) nonce are dropped.
 */
export function useTurnstile(
  siteKey: string,
  theme: 'light' | 'dark' = 'light',
): UseTurnstileResult {
  const nonceRef = useRef(generateNonce());
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsInteraction, setNeedsInteraction] = useState(false);

  const html = useMemo(
    () => buildTurnstileHtml({ siteKey, theme, nonce: nonceRef.current }),
    [siteKey, theme],
  );

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let message: TurnstileMessage;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      console.warn(
        '[Turnstile] received a WebView message that was not valid JSON:',
        event.nativeEvent.data,
      );
      return;
    }

    if (message.nonce !== nonceRef.current) {
      console.warn('[Turnstile] dropped a message with a mismatched nonce.', message.type);
      return;
    }

    switch (message.type) {
      case 'turnstile_success':
        console.log('[Turnstile] challenge passed — token received.');
        setError(null);
        setToken(message.token ?? null);
        return;
      case 'turnstile_error':
        console.error('[Turnstile] widget error callback fired:', message.error);
        setToken(null);
        setError(message.error ?? 'unknown_error');
        return;
      case 'turnstile_expire':
        console.warn('[Turnstile] token expired.');
        setToken(null);
        return;
      case 'turnstile_before_interactive':
        console.log('[Turnstile] escalating to interactive challenge.');
        setNeedsInteraction(true);
        return;
      case 'turnstile_after_interactive':
        console.log('[Turnstile] interactive challenge resolved.');
        setNeedsInteraction(false);
        return;
    }
  }, []);

  const reset = useCallback(() => {
    setToken(null);
    setError(null);
  }, []);

  return { html, token, error, needsInteraction, handleMessage, reset };
}

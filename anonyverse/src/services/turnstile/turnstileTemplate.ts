export interface TurnstileTemplateOptions {
  siteKey: string;
  theme: 'light' | 'dark';
  nonce: string;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Produces a full JS string literal (including its quotes) safe to embed
 * directly inside an inline <script> block. JSON.stringify handles all JS
 * string escaping (quotes, backslashes, control characters, line
 * separators) automatically; the extra replace guards against a value
 * that happens to contain a literal `</script>`, which JSON.stringify
 * does not escape and which would otherwise terminate the surrounding tag.
 */
function jsStringLiteral(value: string): string {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

/**
 * Builds the local HTML page that hosts the Cloudflare Turnstile widget
 * inside a WebView. `data-appearance="interaction-only"` keeps the widget
 * invisible unless Cloudflare decides it needs an actual interactive
 * challenge, at which point its before/after-interactive callbacks fire.
 *
 * Every callback posts a message back to RN via
 * window.ReactNativeWebView.postMessage, stamped with `nonce` so
 * useTurnstile can drop anything that didn't originate from this exact
 * page load (see useTurnstile.ts for the security rationale).
 */
export function buildTurnstileHtml({
  siteKey,
  theme,
  nonce,
}: TurnstileTemplateOptions): string {
  const safeSiteKey = escapeHtmlAttribute(siteKey);
  const safeTheme = escapeHtmlAttribute(theme);
  const nonceLiteral = jsStringLiteral(nonce);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { display: flex; align-items: center; justify-content: center; }
</style>
</head>
<body>
<div
  class="cf-turnstile"
  data-sitekey="${safeSiteKey}"
  data-theme="${safeTheme}"
  data-appearance="interaction-only"
  data-callback="onTurnstileSuccess"
  data-error-callback="onTurnstileError"
  data-expired-callback="onTurnstileExpire"
  data-before-interactive-callback="onBeforeInteractive"
  data-after-interactive-callback="onAfterInteractive"
></div>
<script>
  var NONCE = ${nonceLiteral};

  function postToRN(type, payload) {
    var message = Object.assign({ type: type, nonce: NONCE }, payload || {});
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  }

  function onTurnstileSuccess(token) {
    postToRN('turnstile_success', { token: token });
  }
  function onTurnstileError(error) {
    postToRN('turnstile_error', { error: String(error) });
  }
  function onTurnstileExpire() {
    postToRN('turnstile_expire', {});
  }
  function onBeforeInteractive() {
    postToRN('turnstile_before_interactive', {});
  }
  function onAfterInteractive() {
    postToRN('turnstile_after_interactive', {});
  }
</script>
</body>
</html>`;
}

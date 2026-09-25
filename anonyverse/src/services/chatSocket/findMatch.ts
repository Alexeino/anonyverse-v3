import type { TokenProvider } from '../session/tokenProvider';
import type { ChatSocketService } from './ChatSocketService';
import type { ChatSocketConnectError, ChatSocketConnectErrorReason } from './types';

export interface MatchSelection {
  tags: string[];
  mood: 'good' | 'low';
  optedIn: boolean;
}

export type FindMatchResult =
  | { status: 'matched'; partner: string }
  | { status: 'cancelled' }
  /** The session can't be refreshed — the app has to go back through Entry (get-started/captcha). */
  | { status: 'reauth_required' }
  | { status: 'failed'; reason: ChatSocketConnectErrorReason };

export interface FindMatchOptions {
  service: ChatSocketService;
  tokenProvider: TokenProvider;
  selection: MatchSelection;
  /** Open a fresh socket first. False to rejoin on a socket that's still connected (e.g. after the partner left). */
  connectFirst: boolean;
  /** Aborting stops the loop at once, including any wait in progress, and it resolves 'cancelled'. */
  signal: AbortSignal;
  /** The socket is up and join_chat is about to be sent. */
  onSearching?: () => void;
  /** join_chat was rate limited; the loop waits and retries on its own. */
  onRateLimited?: () => void;
}

/** Connect/join failures in a row (not rate-limit waits) tolerated before giving up. */
const MAX_FAILED_ATTEMPTS = 4;
const MAX_BACKOFF_MS = 8_000;
// Matches the server's connect bucket refill (docs/api.md "Rate limits").
const CONNECT_RATE_LIMIT_WAIT_MS = 10_000;
// Matches the server's join_chat bucket refill.
const JOIN_RATE_LIMIT_WAIT_MS = 15_000;

/** Resolves after `ms`, or as soon as `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

type JoinOutcome =
  | { type: 'matched'; partner: string }
  | { type: 'rate_limited' }
  /** `acked`: the server had accepted this join before the socket dropped. */
  | { type: 'disconnected'; acked: boolean }
  | { type: 'join_failed' }
  | { type: 'cancelled' };

/**
 * Sends join_chat and waits for match_found, a drop, or cancellation. An
 * ok ack ('queued') means the server holds our place, so it just keeps
 * waiting — no re-join (see docs/api.md, join_chat is rate limited).
 */
function joinAndWait(service: ChatSocketService, selection: MatchSelection, signal: AbortSignal): Promise<JoinOutcome> {
  return new Promise(resolve => {
    let settled = false;
    let acked = false;
    // Subscribed before emitting: match_found arrives *before* the
    // 'matched' ack.
    const unsubscribeMatchFound = service.onMatchFound(event => finish({ type: 'matched', partner: event.partner }));
    const unsubscribeConnectionLost = service.onConnectionLost(() => finish({ type: 'disconnected', acked }));
    const onAbort = () => finish({ type: 'cancelled' });
    signal.addEventListener('abort', onAbort);

    function finish(outcome: JoinOutcome) {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribeMatchFound();
      unsubscribeConnectionLost();
      signal.removeEventListener('abort', onAbort);
      resolve(outcome);
    }

    service.joinChat(selection.tags, selection.mood, selection.optedIn).then(
      ack => {
        if (ack.ok) {
          acked = true;
          return;
        }
        finish(ack.status === 'rate_limited' ? { type: 'rate_limited' } : { type: 'join_failed' });
      },
      () => finish({ type: 'join_failed' }),
    );
  });
}

/**
 * Runs matchmaking until a partner is found: (re)connects with a fresh
 * token when needed, sends join_chat, and recovers from everything
 * docs/api.md says a client must handle — invalid_token (refresh, then
 * reconnect once), connect/join rate limits (wait for the bucket to
 * refill), 503/network errors (backoff), and a missing ack, 'offline' ack
 * or dropped socket (reconnect).
 *
 * Callers cancel it by aborting `signal`, and are responsible for closing
 * the socket themselves.
 */
export async function findMatch(options: FindMatchOptions): Promise<FindMatchResult> {
  const { service, tokenProvider, selection, signal } = options;
  let needsConnect = options.connectFirst;
  let forceRefresh = false;
  let failedAttempts = 0;

  // Records a failure; resolves true once it has waited and a retry is
  // still allowed.
  async function backOff(waitMs?: number): Promise<boolean> {
    failedAttempts += 1;
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return false;
    }
    await sleep(waitMs ?? Math.min(1_000 * 2 ** (failedAttempts - 1), MAX_BACKOFF_MS), signal);
    return true;
  }

  while (!signal.aborted) {
    if (needsConnect) {
      const token = await tokenProvider.getFreshAccessToken({ forceRefresh });
      if (signal.aborted) {
        break;
      }
      if (token.status === 'reauth_required') {
        return { status: 'reauth_required' };
      }
      if (token.status === 'failed') {
        if (await backOff()) {
          continue;
        }
        return { status: 'failed', reason: 'UNKNOWN_ERROR' };
      }

      try {
        await service.connect(tokenProvider.peekAccessToken);
      } catch (thrown) {
        if (signal.aborted) {
          break;
        }
        const reason = (thrown as ChatSocketConnectError).reason ?? 'UNKNOWN_ERROR';
        if (reason === 'AUTH_ERROR' || reason === 'MISSING_TOKEN') {
          if (forceRefresh) {
            // A just-refreshed token was refused too — retrying won't help.
            return { status: 'failed', reason };
          }
          forceRefresh = true;
          continue;
        }
        if (await backOff(reason === 'RATE_LIMITED' ? CONNECT_RATE_LIMIT_WAIT_MS : undefined)) {
          continue;
        }
        return { status: 'failed', reason };
      }
      if (signal.aborted) {
        break;
      }
      needsConnect = false;
      forceRefresh = false;
    }

    options.onSearching?.();
    const outcome = await joinAndWait(service, selection, signal);
    if (signal.aborted) {
      break;
    }

    // A join the server accepted ends a failure streak: the limit is for
    // consecutive failures, not blips spread across a long search.
    if (outcome.type === 'disconnected' && outcome.acked) {
      failedAttempts = 0;
    }

    switch (outcome.type) {
      case 'matched':
        return { status: 'matched', partner: outcome.partner };
      case 'rate_limited':
        options.onRateLimited?.();
        await sleep(JOIN_RATE_LIMIT_WAIT_MS, signal);
        continue;
      case 'disconnected':
      case 'join_failed':
        // No ack, an 'offline' ack, or the socket dropped: the server has
        // no state for us either way, so start again from a fresh socket.
        needsConnect = true;
        if (await backOff()) {
          continue;
        }
        return { status: 'failed', reason: 'UNKNOWN_ERROR' };
      // No 'cancelled' case: joinAndWait only resolves 'cancelled' once the
      // signal has aborted, which the check above already caught.
    }
  }

  return { status: 'cancelled' };
}

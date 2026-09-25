# Skip-chat follow-up: hand-off for porting onto main

**Status (2026-09-25):** ported onto branch `large-patch` (from `acb71a1`).
Decisions taken: auto-reconnect after connection loss or background (new
`RematchReason` `'reconnecting'`); the `findMatch` watchdog is dropped;
`topic` is no longer sent in the handshake (the contract only takes
`token`); `findMatch` is cancelled through an `AbortSignal`. This file is
kept for history. Delete it once the branch is merged.

**Original status (2026-09-24):** parked. This work was built on the half-done
skip-chat commit `33ea42b`. Puni has since merged that commit to `main` as
`48ac001` (identical patch), plus a follow-up, `acb71a1` "Added end-chat flow,
rematch reasons and connection-loss handling", which reimplements a large part
of the same ground differently. The plan is to take a fresh branch from `main`
and re-apply the pieces below on top of Puni's code instead of rebasing.

## Where the code is

| What | Ref |
|---|---|
| Full work, as one commit | branch `backup/skip-chat-mine`, commit `3e81e1b` (parent `33ea42b`) |
| Same work, original stash | `stash@{1}` at time of writing: "WIP on feat/skip-chat: 33ea42b" (clean, no conflict markers) |
| Conflicted copy (ignore) | `stash@{0}` "WIP on fix-app": a failed pop onto `1c74c57`, has conflict markers |
| This document | `docs/handoff/skip-chat-rework.md` on `backup/skip-chat-mine` |

Read any file from the backup without switching branches:

```sh
git show backup/skip-chat-mine:anonyverse/src/services/chatSocket/findMatch.ts
git diff origin/main backup/skip-chat-mine -- <path>     # my version vs main
git diff 33ea42b backup/skip-chat-mine -- <path>         # only what I changed
```

## Backend guidance to respect

From the backend, after the skip work:

> Don't call `join_chat` after `chat_ended {reason: "skipped"}`. The server
> already requeues both users, and the next event is `match_found` or
> `queued`. The server copes if the app re-joins, but it's a wasted call that
> uses up the `join_chat` rate limit.

- **Main already complies.** On `skipped`, `useChatController` only sets
  `rematchState = 'rematching'` and a reason, then waits.
- **My version did not fully comply.** It waited too, but a 60s
  `QUEUED_WATCHDOG_MS` timer sent `join_chat` if no `match_found` arrived, even
  after the server had sent `queued`. **Do not port that timer.** If a
  safety net is wanted, fire it only when *neither* `queued` nor
  `match_found` arrives within ~10s of `chat_ended {skipped}`, and subscribe
  to `onQueued` to cancel it.
- The same applies to `findMatch`'s own 60s watchdog (re-sends `join_chat`
  while `queued`). It exists for the old "acked `queued` without queueing"
  server bug in `docs/api.md` "Known issues". Ask the backend whether that bug
  is fixed. If yes, drop the watchdog. If no, keep it but make it much longer.

## What I built, by area

Files marked **clean** don't exist on main or weren't touched by `acb71a1`.
They can be copied over almost as-is. Files marked **overlap** were also
changed by Puni, so they need a manual port.

### 1. Session refresh: token provider (clean)

The access token expires, and before this work the app just failed with
`MISSING_TOKEN`. Now every socket connect gets a fresh token.

- `services/auth/types.ts`, `AuthService.ts`, `restAuthService.ts`: adds
  `refresh(refreshToken)` → `POST /api/v1/jwt/refresh`. Outcomes: `refreshed`,
  `reauth_required` (401), `failed` (429/5xx/network). Also tightens
  `VerifyResponse` (`token`/`device` are `| null`, not optional) and trims
  stale "verified against localhost" comments.
- `services/session/SessionStore.ts`, `inMemorySessionStore.ts`: `getToken()`
  no longer silently clears an expired token (the refresh token may still be
  good). Adds `isAccessTokenExpired(marginMs)` and `isRefreshTokenExpired()`.
  The `*_expiry` fields are seconds since issue, not timestamps.
- **New** `services/session/tokenProvider.ts`:
  `getFreshAccessToken({forceRefresh})` refreshes when the access token is
  within 60s of expiry. Refreshes are single-flight, because each refresh
  revokes the refresh token it was sent. `peekAccessToken()` is for the socket's
  auth callback. On `reauth_required` it clears the store.
- Tests: `services/session/__tests__/tokenProvider.test.ts` (new),
  `services/auth/__tests__/restAuthService.test.ts` (refresh cases). The mocks
  in `entry/__tests__/useEntryController.test.tsx` and
  `verification/__tests__/useVerificationController.test.tsx` gain
  `refresh`, `isAccessTokenExpired` and `isRefreshTokenExpired`.

### 2. HTTPS guard shared by REST and socket (clean)

- `config/env.ts`: `isApiBaseUrlSecure(url?, isDev?)`. `https://` passes.
  Non-https passes in dev with a warning and fails closed in production.
- `services/api/httpClient.ts`: `postJson` refuses to send when insecure. The
  refresh token goes over REST, so this matters now.
- The socket service uses the same helper (replacing its inline check).
- Test: `config/__tests__/env.test.ts` (new).

### 3. App foreground hook (clean)

- **New** `hooks/useAppForeground.ts`: calls back on background → active only
  (iOS `inactive` doesn't count). The OS kills the socket in the background
  and the server forgets the chat/queue, so screens restart on return.

### 4. Chat socket service (overlap)

My changes to `ChatSocketService.ts`, `socketIoChatSocketService.ts`,
`types.ts` and `devNoopChatSocketService.ts`:

- `connect(getAccessToken: () => string | null)` instead of
  `connect(accessToken, topic)`. The socket.io `auth` is a callback, so every
  handshake reads the current token. `topic` is dropped from the handshake.
  `connect()` closes any previous socket first, and a superseded pending
  connect rejects immediately (`abortPendingConnect`).
- Connect error mapping adds `RATE_LIMITED` and `UNAVAILABLE`.
- `joinChat` rejects with typed `JoinChatError` (`JOIN_TIMEOUT` |
  `NOT_CONNECTED`) and requires `socket.connected`. `JoinChatStatus` adds
  `rate_limited` and `offline`.
- New events: `onQueued` (`QueuedEvent`), `onServerError`, and
  `onDisconnect(reason)` with a `CLIENT_DISCONNECT_REASON` constant so callers
  can tell our own close from a drop.
- `endChat(): Promise<void>` emits `end_chat` and resolves on
  `chat_ended {ended, self}`, disconnect, or a 2s timeout.
- Refactor: `createHandlerSet<T>()` replaces the hand-written handler sets.
  Explicit `path: '/socket.io'`.

**What main has instead:** `sendEndChat(): void`, `onServerError`,
`onConnectionLost()` (no reason; filters `io client disconnect` inside), and
`toBackendMood()` in the service ('low' → 'fl', others pass through). Main
still uses `connect(accessToken, topic)`.

**Port plan:** keep main's names (`sendEndChat`, `onConnectionLost`,
`toBackendMood`). Add only what my features need:

- `connect(getAccessToken)`, which the token refresh needs
- `onQueued`
- `RATE_LIMITED`/`UNAVAILABLE` mapping
- typed join errors
- connect-supersedes-previous

Drop my `toServerMood` in `findMatch.ts`: main's mapper does the same job.
Mine sent `'casual'` for good mood and main sends `'good'`; the server treats
anything but `'fl'` as neutral. Keep the `createHandlerSet` refactor only if it
doesn't make the diff noisy for Puni.

Test helper (clean): **new**
`services/chatSocket/testing/fakeChatSocketService.ts`, a controllable fake
with `emitX` helpers and `jest.fn` spies. Update it to main's interface names.

### 5. Matchmaking loop, `findMatch` (clean file, depends on 1 and 4)

**New** `services/chatSocket/findMatch.ts`, shared by Finding Match and by
rematching inside Chat. It loops until matched or cancelled:

- Connects with a fresh token. On `AUTH_ERROR`/`MISSING_TOKEN` it
  force-refreshes once, then gives up.
- Connect `RATE_LIMITED`: waits 10s (connect bucket refill).
- `join_chat` `rate_limited`: waits 15s, calls `onRateLimited`, and doesn't
  count as a failure.
- 503, network, no ack, `offline` ack or a dropped socket: reconnects with
  exponential backoff (1s → 8s cap), giving up after 4 consecutive failures.
  An accepted join resets the streak.
- Watchdog after a `queued` ack (see the backend guidance above: shorten or
  drop).
- Result: `matched | cancelled | reauth_required | failed(reason)`.
  Cancellation is via an `isCancelled()` callback plus disconnecting the
  socket.

### 6. Finding Match screen (overlap, small)

`useFindingMatchController.ts` is rewritten around `findMatch`. Main only
touched the screen's `PAIR_WIDTH` and the test mock. Changes:

- Takes `tokenProvider` instead of `sessionStore`, plus `onReauthRequired`.
- `chat_ended {by: partner}` during the 1.2s match→chat handoff delay
  (matched with someone who just left): cancel the handoff and search again.
- A socket drop during the handoff: reconnect and search again.
- The app returns from background: restart the search (`searchAttempt` bump).
- `handleClose`: `endChat()` then `disconnect()`, so the server drops us from
  the queue. `closedRef` stops a pending handoff firing during the crossfade.
- `FindingMatchScreen.tsx`: new props, `RATE_LIMITED`/`UNAVAILABLE` error copy.
- Tests: `findingMatch/__tests__/useFindingMatchController.test.tsx` rewritten
  against the fake service.

### 7. Chat screen and controller (overlap, heavy)

**Main's design (keep as the base):**

- `rematchState: 'idle' | 'rematching'`
- `RematchReason: 'you_skipped' | 'partner_skipped' | 'partner_ended'`
- `rejoinQueue` (3 attempts, 15s apart) with `rematchStatusMessage` and
  `rematchGaveUp`
- `LeaveChatConfirmModal` with `handleRequestLeave`, `handleConfirmLeave` and
  Android back handling
- `connectionLost`: a terminal "connection lost, leave" state
- skip token bucket
- `useChatController(service, selection, onLeave)`

**Mine:**

- `rematchState: 'idle' | 'skipped' | 'partner_left' | 'reconnecting'`
- Rejoin via `findMatch` (token refresh, reconnect, backoff)
- `resume()`: on socket drop, on returning to foreground, or on server
  `409 not_in_chat` while chatting, it resets messages to "Chat ended — you
  left the app." and reconnects and rejoins automatically
- `leave()` / `matchGenerationRef` / `leavingRef` to stop stray rejoins
- `onReauthRequired`
- Signature `useChatController(service, selection, tokenProvider, onLeave,
  onReauthRequired)`

**Pieces to port onto main's controller:**

1. **Partner-ended rejoin → `findMatch`**. Replace `rejoinQueue`'s bare
   `joinChat` with `findMatch({connectFirst: false, ...})`, so an expired
   token or dropped socket recovers. Map `onRateLimited` to main's
   `rematchStatusMessage` ("Matchmaking is busy…") and `failed` to
   `rematchGaveUp`. `reauth_required` → `onReauthRequired`.
2. **Connection loss / background.** Main treats it as terminal. Mine
   auto-reconnects. **Product decision needed** (ask Puni/design). If
   auto-reconnect is adopted: add a `RematchReason` such as `'reconnecting'`
   with copy "Chat ended while you were away — finding new match", drive it from
   `onConnectionLost` + `useAppForeground` + `not_in_chat`, and rejoin with
   `findMatch({connectFirst: true})`. If not: at least handle foreground,
   because a backgrounded socket is dead even when no disconnect fired.
3. **Message size limits** (not on main): `MAX_INPUT_LENGTH = 1500` exported
   and set as the `TextInput` `maxLength` in `ChatScreen`. Truncate the reply
   preview to 200 chars. If the JSON envelope exceeds 2000
   (`send_message`'s silent-drop limit), send plain text instead.
4. **Skip:** nothing to port. Main is correct. Don't add the watchdog (see
   the backend guidance above).
5. **Skip bucket:** both have one. Keep main's (`0.033/s` ≈ my 30s refill).
6. **Leave:** keep main's `handleConfirmLeave`. Optionally use a
   promise-returning end so `end_chat` flushes before `disconnect`. Main
   emits and disconnects back to back, which socket.io does flush in order.
7. `ChatScreen.tsx` / `FindingNewMatchModal.tsx`: keep main's `reason` prop and
   copy. Add the reconnecting variant only if (2) goes auto-reconnect.
8. Tests: `chat/__tests__/useChatController.test.tsx`. Start from main's and
   add cases for findMatch-based rejoin, reauth, the message limits, and
   "skip → `queued` → no `join_chat`".

### 8. Navigation (overlap, small)

- `RootNavigator.tsx`: `useResetToEntry()` resets the stack to `Entry`. It's
  passed as `onReauthRequired` to every `ChatScreen`/`FindingMatchScreen`
  (Verification route, MoodSelect route, DevFindingMatch, DevChat). Dev menu
  copy: "sends you back to Entry unless you've verified this session".
- `types.ts`: `DevChat` params carry `selection: TopicsSelection` instead of
  `mood`/`topic`. Main solved the same thing inside `DevChatRoute` by building
  a selection from `mood`/`topic`. Either is fine; keep main's to shrink the
  diff.

### 9. Docs and misc

- `docs/api.md`: full rewrite against the current backend contract (REST
  including `jwt/refresh` and `health`, socket connect/refusal, heartbeat,
  every event with ack shapes, rate limits, flows, known issues). Main still
  has the old version and `acb71a1` didn't touch it, so it ports cleanly.
  **Check it against the latest backend doc first.**
- **New** `docs/app-journey.md`: mind map, user journey, auth/refresh,
  `findMatch` loop, Finding Match/Chat state machines, server event →
  handler table, debugging cheat sheet. **Rewrite sections 5, 7 and 8 after the
  port** to match the merged controller.
- `TopicsScreen.tsx`: comment-only updates.
- `secureDeviceIdentityService.ts`: comment-only.
- `assets/images/Mili.png`: modified binary. Check whether it's intentional
  before carrying it over.
- `ios/Podfile.lock`: don't copy it. Main's `package.json` already lists
  keyboard-controller, reanimated, worklets and blur, so run
  `cd anonyverse/ios && pod install` on the new branch and commit the result.

## Suggested port order

Each step should build, and its tests should pass, before starting the next.

1. `git switch -c feat/<name> origin/main`, then
   `git checkout backup/skip-chat-mine -- docs/handoff/skip-chat-rework.md`.
2. Section 2 (HTTPS guard), 3 (foreground hook) and 1 (token provider):
   copy the files with `git checkout backup/skip-chat-mine -- <paths>`, then
   fix the test mocks.
3. Section 4: extend main's socket service (connect with getter, `onQueued`,
   error mapping, typed join errors). Port the fake service.
4. Section 5: copy `findMatch.ts` and apply the watchdog decision.
5. Section 6: Finding Match controller and screen, plus navigation
   `onReauthRequired` (section 8).
6. Section 7: chat controller pieces 1, 3 and 8, then 2 once decided.
7. Section 9: `docs/api.md`, `docs/app-journey.md`, `pod install`.
8. Run `branch-code-reviewer` and `branch-security-reviewer`. Auth, tokens
   and network are touched, so the security review is required per
   `CLAUDE.md`.

## Open questions

- Auto-reconnect after connection loss/background, or keep main's terminal
  "connection lost" state? (section 7, item 2)
- Is the "acked `queued` without queueing" server bug fixed? This decides the
  `findMatch` watchdog.
- Should the handshake still send `topic`? Main does, mine dropped it. Check
  the backend contract.

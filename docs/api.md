# Anonyverse API Reference

Reverse-engineered from the client app (`anonyverse-v2`) as of 2026-09-07. This documents every backend call the app makes today, plus the gaps where the client has UI/state for a feature but no backend call exists yet.

The client talks to the backend over two channels:

1. **REST** — `axios` client (`src/network/client.ts`), base URL from `EXPO_PUBLIC_API_BASE_URL` (`ENV.API_BASE_URL`). Used for device onboarding, human verification, and token refresh.
2. **WebSocket (Socket.IO)** — `src/chat/services.ts`, connects to the same `API_BASE_URL` over the `websocket` transport. Used for matchmaking and live chat.

There's also a **static config fetch** (not a backend API — a JSON file on a CDN) used to drive the topic-selection screen.

All REST requests are sent with header `ngrok-skip-browser-warning: true` (a dev artifact of tunneling local backends through ngrok) and `Content-Type: application/json`.

---

## 1. REST API

### POST /api/v1/captcha/get-started

**Purpose:**
Called on every cold app start. Checks whether this device is already known/verified and, if so, returns session tokens directly — skipping the human-verification (captcha) screen.

**Request:**
```json
{
  "device_id": "existing-device-id-or-null",
  "app_version": "1.0.0",
  "platform": "ios"
}
```

**Response:**
```json
{
  "device_exists": true,
  "verified": true,
  "token": {
    "access_token": "...",
    "refresh_token": "...",
    "access_token_expiry": 3600,
    "refresh_token_expiry": 2592000
  },
  "device": {
    "device_id": "..."
  }
}
```

`token` and `device` are omitted when the device is new or not yet verified.

**Client behavior:**
- `verified: true` + `token` present → tokens are stored, user is treated as authenticated.
- Otherwise → user is routed to the verification (Cloudflare Turnstile) screen.
- HTTP 401 is also treated as "verification required".

**Possible outcomes:**
- `AUTHENTICATED`
- `VERIFICATION_REQUIRED`
- `FAILED` (network/server error)

---

### POST /api/v1/captcha/verify

**Purpose:**
Submits a completed Cloudflare Turnstile challenge to verify the device as human and issue session tokens.

**Request:**
```json
{
  "device_id": "existing-device-id-or-null",
  "token": "turnstile-challenge-token",
  "platform": "ios",
  "app_version": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "token": {
    "access_token": "...",
    "refresh_token": "...",
    "access_token_expiry": 3600,
    "refresh_token_expiry": 2592000
  },
  "device": {
    "device_id": "...",
    "platform": "ios",
    "app_version": "1.0.0"
  }
}
```

**Possible outcomes:**
- `success: true` → tokens saved, user authenticated.
- `success: false` or request throws → verification failed, user stays on the verification screen.

---

### POST /api/v1/jwt/refresh

**Purpose:**
Exchanges a refresh token for a new access/refresh token pair. Called lazily whenever the client is about to make an authenticated call (REST or socket) and detects the stored access token has expired (see `useSession`/`recoverAndResume` in `src/shared/hooks/sessions.ts`).

**Request:**
```json
{
  "refresh_token": "..."
}
```

**Response:**
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "access_token_expiry": 3600,
  "refresh_token_expiry": 2592000
}
```

**Possible outcomes:**
- 200 → new tokens saved, session resumed.
- 401 → refresh token itself expired/invalid, client falls back to `VERIFICATION_REQUIRED` (re-runs `get-started`/verification flow).
- Other error → `FAILED`.

**Note:** expiry fields are relative seconds-from-now (`token.access_token_expiry * 1000` is added to `Date.now()` client-side), not absolute timestamps.

---

## 2. App Config (static JSON, not a backend endpoint)

### GET `EXPO_PUBLIC_CONFIG_URL`

Defaults to `https://config.anonyverse.app/dist/app-configs.json`. This is a static, unauthenticated JSON file (likely on a CDN), fetched with `silent: true` (no user-facing error toast on failure), used purely to drive the topic-selection screen. It is **not** part of the application backend and has no request body.

**Response:**
```json
{
  "version": 1,
  "topics": [
    {
      "id": "life",
      "title": "Life",
      "description": "Talk about everyday life",
      "icon": "material-icon-name",
      "enabled": true,
      "theme": { "...": "optional card theme overrides" }
    }
  ]
}
```

---

## 3. Realtime API (Socket.IO)

### Connection

```
io(API_BASE_URL, {
  transports: ["websocket"],
  auth: {
    token: accessToken,
    topic: primaryTopic   // tags[0], or null
  },
  extraHeaders: { "ngrok-skip-browser-warning": "true" }
})
```

- Requires a valid `access_token` (from the REST flow above) — if none is stored, the client never attempts to connect (`MISSING_TOKEN`).
- One socket connection is reused for the entire matchmaking + chat session; the client explicitly disconnects and creates a fresh socket per new search.
- Connection timeout is 10s client-side; no response within that window resolves as `CONNECTION_TIMEOUT`.
- `connect_error` payloads are parsed for a `reason` field; known reasons are mapped to `AUTH_ERROR` (`invalid_token`) or `MISSING_TOKEN` (`missing_token`), else `UNKNOWN_ERROR`.

### Client → Server events

#### `join_chat`

**Purpose:**
Enter (or re-enter) the matchmaking queue. Emitted automatically right after connecting, and again automatically by the client if it reconnects while still waiting or if the partner ends/disconnects (server-driven re-queue after a skip is NOT re-triggered client-side, to avoid a race — the server is expected to requeue both sides on `skip_chat` itself).

**Payload (positional args):**
```
join_chat(tags: string[], mood: string, optedIn: boolean)
```
- `tags` — selected topic(s), e.g. `["life", "work"]`
- `mood` — `"casual"` by default, or a mood value selected via the mood-selection modal
- `optedIn` — whether the user opted in to be matched with someone in a worse mood (shown as a banner on the happy topic-selection screen)

**Response:** none directly; the server responds asynchronously via `match_found` (see below).

---

#### `send_message`

**Purpose:**
Send a chat message to the currently matched partner.

**Payload:**
A single string. If the message is a reply to another message, the client JSON-encodes it as `{"text": "...", "replyTo": {...}}`; otherwise it's sent as a plain string. The server is expected to treat this opaquely and echo it back to the partner via `receive_message` — encoding/decoding of the reply envelope is entirely client-side convention, not a server contract.

```
send_message("plain text")
send_message("{\"text\":\"plain text\",\"replyTo\":{\"id\":\"...\",\"sender\":\"me\",\"text\":\"...\"}}")
```

**Response:** none to the sender; delivered to the partner as `receive_message`.

---

#### `skip_chat`

**Purpose:**
End the current chat and immediately look for a new partner (both users are expected to be re-queued server-side).

**Payload:** none.

**Response:** none directly; server is expected to emit `chat_ended` (reason `"skipped"`) to both sides.

---

#### `end_chat`

**Purpose:**
End the current chat without automatically re-queueing.

**Payload:** none.

**Response:** none directly; server is expected to emit `chat_ended` (reason `"ended"`) to both sides.

---

#### `report_user`

**Purpose:**
Report the current chat partner for review.

**Payload:** none — fire-and-forget, no report reason/category is sent.

**Response:** none observed client-side. The client optimistically shows a confirmation UI ("All reports are anonymous and confidential") without waiting on any server acknowledgment.

**Gap:** there is no ack/response event handled for this — see [Not Yet Implemented](#4-not-yet-implemented--planned) below.

---

#### `typing` / `typing_stop`

**Purpose:**
Notify the partner that the user is/isn't currently typing. Debounced client-side (`typing_stop` auto-fires after 4s of inactivity or on send/blur).

**Payload:** none.

**Response:** delivered to the partner as `partner_typing` / `partner_typing_stop`.

---

### Server → Client events

#### `match_found`

**Purpose:**
Sent when the matchmaking queue pairs the user with a partner.

**Payload:**
```json
{ "partner": "partner-socket-or-user-id" }
```

**Client behavior:** opens/resets `activeChat` with a system "Connected with anonymous partner. Say Hi!" message. If a `chat_ended` for the previous partner is still pending, the transition is delayed ~600ms so the "ended" state is visible before the new match appears.

---

#### `chat_ended`

**Purpose:**
Sent when the current chat ends, for any reason.

**Payload:**
```json
{ "reason": "skipped" | "ended" | "disconnected", "by": "self" | "partner" }
```

**Client behavior:**
- `reason: "skipped"` → shows a rematching state and waits for the next `match_found`. If 3+ skips happen within 8 seconds, the client stops auto-rematching and shows a "Matchmaking unavailable" toast instead (client-side rate limit, not server-driven).
- `reason: "ended"` or `"disconnected"` → chat is marked ended with a system message; if `by: "partner"`, the client automatically re-emits `join_chat` to look for a new match.

**Possible states surfaced in the UI:** `searching`, `matched`, `rematching`, `ended`, `disconnected`, `timeout` (client-side connection timeout, not a server event), `cancelled` (see gaps below — not currently backed by a server event).

---

#### `receive_message`

**Purpose:**
Delivers a message sent by the partner.

**Payload:**
```json
{ "message": "plain text or JSON-encoded {text, replyTo} envelope" }
```

---

#### `partner_typing` / `partner_typing_stop`

**Purpose:**
Mirrors the partner's typing state. Payload: none. Client auto-clears the "typing" indicator after 4s if no `partner_typing_stop` arrives (defensive timeout, not a guaranteed server contract).

---

#### `connect` / `connect_error`

Standard Socket.IO lifecycle events, used to drive the `join_chat` (re)emission logic and surface connection failures. See [Connection](#connection) above for `connect_error` reason handling.

---

## 4. Not Yet Implemented / Planned

These are referenced by client-side state, UI, or planning docs (`plans/mvp-todo-list.md`), but have **no corresponding backend call today**. Flagging them explicitly since this doc is meant to seed a v2 backend/API contract.

- **Explicit "cancel search" / "leave queue"** — there's no dedicated event to leave the matchmaking queue without also disconnecting the socket entirely. `plans/mvp-todo-list.md` calls this out directly ("emit leave event *if supported*"). Today, cancelling out of search just disconnects the socket.
- **Report reason/category** — `report_user` carries no payload (no reason, no evidence, no message IDs). If v2 wants structured moderation, this needs a real request/response contract, e.g.:
  ```json
  // Not yet provided — proposed shape only
  { "reason": "harassment", "message_ids": ["..."] }
  ```
- **Report acknowledgment** — no server response/ack is handled for `report_user`; the client can't currently tell the user whether a report was actually received.
- **Entitlements / paywall API** — `src/entitlements/store.ts` has client-side state for `isPaid` and `hasSavedChats`, but no API call populates or persists either value anywhere in the codebase. Not yet provided:
  - Fetch entitlement/subscription status
  - Purchase/restore endpoints
  - Saved-chats persistence (list/get/delete past conversations) — there is currently no chat history persistence at all; chat state is in-memory only and lost on leaving the screen.
- **Logout / device revocation** — there's no endpoint to invalidate tokens or unlink a device; tokens are only ever replaced (via refresh) or left to expire.
- **Push notifications** — no registration endpoint (e.g. for match-found or message-received notifications while backgrounded).
- **User/profile data** — the app is fully anonymous/device-based today; there is no endpoint for any user-identifying profile beyond the opaque `device_id`.

---

## Appendix: Auth & Session Notes for v2

- Auth is device-based, not account-based: `device_id` is the only persistent identity, generated/stored client-side (`expo-secure-store`) and echoed back by the server on first verification.
- Access tokens are short-lived; refresh tokens are long-lived. The client proactively refreshes before an expired access token would be used (see `useSession`/`recoverAndResume`), rather than reacting to a 401.
- The same access token used for REST calls is passed as `auth.token` on the Socket.IO handshake — there is one shared token, not separate REST/WS credentials.

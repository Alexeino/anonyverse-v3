# Anonyverse API contract

This is the contract between the Anonyverse backend (`anonyverse-core`) and its clients: the REST endpoints, the Socket.IO events, and the rules a client must follow when the connection drops. If the backend changes any behaviour described here, update this file in the same PR.

- [Overview](#overview)
- [Authentication](#authentication)
- [REST endpoints](#rest-endpoints)
- [Socket connection](#socket-connection)
- [Client → server events](#client--server-events)
- [Server → client events](#server--client-events)
- [Flows](#flows)
- [Connection lifecycle rules](#connection-lifecycle-rules)
- [Rate limits](#rate-limits)
- [Known issues](#known-issues)

## Overview

| | |
|---|---|
| REST base path | `/api/v1` |
| Socket.IO path | `/socket.io` (same host) |
| Socket transport | **WebSocket only**. Long-polling is disabled. |
| Encoding | JSON |
| Identity | A **device**, identified by `device_id`. There are no user accounts. |

A client first gets a JWT pair over REST, then opens a Socket.IO connection with the access token. All matchmaking and chat happens over the socket.

## Authentication

```text
App start
  │
  ├─ POST /api/v1/captcha/get-started  { device_id?, platform, app_version }
  │     ├─ verified: true  → use the returned token, skip captcha
  │     └─ verified: false → show Turnstile captcha
  │                           └─ POST /api/v1/captcha/verify  { token, device_id?, platform?, app_version? }
  │                                 → token + device (store device.device_id)
  │
  ├─ Connect the socket with auth: { token: access_token }
  │
  └─ Before the access token expires: POST /api/v1/jwt/refresh { refresh_token }
```

### Token object

Returned by `get-started` (when verified) and `verify`:

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<jwt>",
  "access_token_expiry": 1800,
  "refresh_token_expiry": 14400
}
```

| Field | Meaning |
|---|---|
| `access_token` | Used to connect the socket. Valid for 30 minutes. |
| `refresh_token` | Used once to get a new pair. Valid for 4 hours. **Each refresh revokes the old refresh token**, so always store the new one. |
| `*_expiry` | Lifetime in **seconds** from the moment the token was issued (not a timestamp). |

The JWT claims are `device_id`, `iat`, `exp`, `token_type` (`"access"` or `"refresh"`), `turnstile_verified`, and `jti` (refresh tokens only). Clients don't need to decode them.

## REST endpoints

Every error response uses FastAPI's shape: `{"detail": "<message>"}`. A request body that fails validation returns `422` with FastAPI's standard validation error.

### `POST /api/v1/captcha/get-started`

Checks whether this device is already known, so the app can skip the captcha.

Request:

```json
{
  "device_id": "device_01a0…",   // optional; omit on first install
  "platform": "ios",             // required
  "app_version": "1.0.0"         // required
}
```

Response `200`:

```json
{
  "device_exists": true,
  "verified": true,
  "token": { …token object… }    // null when verified is false
}
```

- With no `device_id`, it returns `device_exists: false, verified: false, token: null`.
- A device only counts as known if **`device_id`, `platform` and `app_version` all match** what was stored at verification. After an app update (a new `app_version`), the device is treated as unknown and has to pass the captcha again.

Errors: `429`.

### `POST /api/v1/captcha/verify`

Verifies a Cloudflare Turnstile token, registers the device if needed, and issues tokens.

Request:

```json
{
  "token": "<turnstile token>",  // required
  "device_id": "device_01a0…",   // optional
  "platform": "ios",             // optional
  "app_version": "1.0.0"         // optional
}
```

Response `200` on success:

```json
{
  "success": true,
  "token": { …token object… },
  "device": { "device_id": "device_01a0…", "platform": "ios", "app_version": "1.0.0" }
}
```

Response `200` when the captcha fails: `{"success": false, "token": null, "device": null}`.

- Without a `device_id`, the server creates one (`device_<uuid7>`). **Store `device.device_id`** and send it on every later `get-started` and `verify`.
- With a `device_id` the server hasn't seen, the server registers it under that id.

Errors: `429`, `500 {"detail": "Error verifying captcha"}`.

### `POST /api/v1/jwt/refresh`

Request: `{"refresh_token": "<jwt>"}`

Response `200`:

```json
{
  "access_token": "<jwt>",
  "access_token_expiry": 1800,
  "refresh_token": "<jwt>",
  "refresh_token_expiry": 14400
}
```

| Status | `detail` | What the client should do |
|---|---|---|
| `401` | `Refresh token has been revoked` | Go back to `get-started` / captcha |
| `401` | `Invalid or expired refresh token` | Go back to `get-started` / captcha |
| `429` | `Too many requests` | Back off and retry |
| `503` | `Service unavailable` | Retry with backoff |
| `500` | `Internal server error` | Retry with backoff |

### `GET /api/v1/health`

Not rate limited. Response `200`: `{"status": "ok", "db": "ok" | "error", "cache": "ok" | "error"}`.

(`/docs`, `/docs/login` and `/api/v1/jwt/docs/token` are internal and serve the Swagger UI. Clients don't use them.)

### `POST /api/v1/feedback`

**Purpose:**
Submits text feedback about the app from a verified device (see `src/services/feedback/restFeedbackService.ts`).

**Auth:** `Authorization: Bearer <access_token>`. The device is taken from the token — the request never carries a `device_id`. `platform` and `app_version` are copied server-side from the device record.

**Request:**
```json
{
  "type": "BUG",
  "message": "The chat screen freezes.",
  "rating": 2,
  "screen": "ChatScreen",
  "os_version": "15"
}
```
- `type`: `BUG` | `FEATURE_REQUEST` | `IMPROVEMENT` | `GENERAL`
- `message`: 1–2000 characters after trimming
- `rating`: optional, 1–5
- `screen`, `os_version`: optional, max 50 characters

**Response (201):**
```json
{
  "id": 1,
  "status": "NEW",
  "created_at": "2026-09-26T00:00:00Z"
}
```

**Possible outcomes:**
- 201 → saved with `status: NEW`.
- 401 → missing/expired/invalid token, or the device no longer exists. The app asks the user to restart.
- 403 → device is blocked.
- 422 → invalid input.
- 429 → rate limited (5 per 10 minutes per IP).

## Socket connection

```ts
import { io } from "socket.io-client";

const socket = io(BASE_URL, {
  path: "/socket.io",
  transports: ["websocket"],
  // Use a callback so every reconnect sends the current access token.
  auth: (cb) => cb({ token: getAccessToken() }),
});
```

### Connection refused

If the server rejects the connection, the client gets a `connect_error`. `err.message` is the reason, and `err.data` holds both the code and the reason:

```ts
socket.on("connect_error", (err) => {
  err.message; // "invalid_token"
  err.data;    // { code: 401, reason: "invalid_token" }
});
```

Errors raised by the client library itself (for example, the network is down) have no `err.data`.

| code | reason | Cause | What the client should do |
|---|---|---|---|
| 401 | `missing_token` | No `auth.token` | Get a token first |
| 401 | `invalid_token` | Expired, malformed or wrong type (a refresh token) | Refresh the token, then reconnect |
| 429 | `rate_limited` | Too many connects from this device (see [Rate limits](#rate-limits)) | Wait about 10 seconds, then reconnect |
| 503 | `unavailable` | The server couldn't register the session | Retry with backoff |

### Heartbeat

The server pings every **25s** and drops the connection if a pong doesn't arrive within **60s**. The Socket.IO client handles this automatically. When a connection disappears without closing cleanly (lost signal), the server may take up to about **85s** to notice.

### Identity on the socket

Every connection gets a new server-side id (the **sid**). A reconnect is a new sid with **no queue or chat state**: the server does not resume anything. `match_found.partner` is the partner's sid. Treat it as an opaque, per-connection value.

## Client → server events

All events are rate limited **per device**. When a limit is hit, the server emits `error {code: 429, reason: "rate_limited"}`, except for typing events, which are dropped silently.

### `join_chat(tags, mood, opted_in)` → ack

Start looking for a partner.

| Argument | Type | Meaning |
|---|---|---|
| `tags` | `string[]` | Topics. Allowed: `life`, `work`, `relationships`, `health`, `overthinking`, `hobbies`, `love`, `career`. Unknown tags are ignored. |
| `mood` | `string` | `"fl"` means low mood: only match partners who have `opted_in`. Any other value has no effect. |
| `opted_in` | `boolean` | Willing to be matched with low-mood users. |

Send the arguments positionally, and use an ack:

```ts
const res = await socket.emitWithAck("join_chat", ["work", "life"], "casual", true);
```

Ack:

| Ack | Meaning |
|---|---|
| `{ok: true, status: "matched"}` | Matched. A `match_found` event arrives as well (**before** the ack). |
| `{ok: true, status: "queued"}` | Waiting. A `match_found` will arrive when someone joins. |
| `{ok: false, status: "rate_limited"}` | Too many joins. An `error` event is emitted too. |
| `{ok: false, status: "offline"}` | The connection closed while matching. In practice the client never sees this. |

If **none** of the tags are allowed, the server raises and **no ack is sent**. Use a timeout on the ack.

Partners are ranked by how many tags they share with you. Matching is instant when someone is waiting; otherwise you wait in the queue.

### `send_message(message)`

`message` is a string of up to **2000 characters**. It is delivered to the partner as `receive_message`. The sender gets no echo or ack.

- Not in a chat → `error {code: 409, reason: "not_in_chat"}`.
- A non-string or a message over 2000 characters is **dropped silently**.

### `skip_chat()`

End the current chat and look for someone new. Both users are put back in matchmaking automatically, and the two devices can't be matched with each other again for **20s**, even if either one reconnects. See [Skip](#skip).

If you're not in a chat, nothing happens and no event is sent.

### `end_chat()`

Stop chatting (or stop searching). The server always replies with `chat_ended {reason: "ended", by: "self"}`.

- In a chat → the partner gets `chat_ended {reason: "ended", by: "partner"}`. **Neither user is requeued.**
- Queued → you're removed from the queue (this cancels the search).

### `typing()` / `typing_stop()`

Forwarded to the partner as `partner_typing` / `partner_typing_stop`. Ignored when you're not in a chat or when rate limited.

## Server → client events

| Event | Payload | When |
|---|---|---|
| `match_found` | `{partner: string}` | You were paired: from `join_chat`, when someone joins while you're queued, or after a skip. |
| `queued` | `{partner: null}` | **After a skip only**: you were put back in the queue. (After `join_chat`, "queued" comes in the ack instead.) |
| `chat_ended` | `{reason, by}` | See the table below. |
| `receive_message` | `{message: string}` | The partner sent a message. |
| `partner_typing` | `{}` | The partner is typing. |
| `partner_typing_stop` | `{}` | The partner stopped typing. |
| `error` | `{code, reason}` | `429 rate_limited` or `409 not_in_chat`. |

`chat_ended`:

| reason | by | Meaning | Are you requeued? |
|---|---|---|---|
| `skipped` | `self` | You skipped | Yes, `match_found` or `queued` follows |
| `skipped` | `partner` | Your partner skipped you | Yes, `match_found` or `queued` follows |
| `ended` | `self` | You called `end_chat` | No |
| `ended` | `partner` | Your partner called `end_chat` | **No: call `join_chat` again if you want a new partner** |
| `disconnected` | `partner` | Your partner's connection dropped (app in the background, closed, lost network) | **No: call `join_chat` again if you want a new partner** |

The server also sends `chat_ended {reason: "disconnected", by: "self"}`, but it's addressed to the connection that just closed, so **a client never receives it**. See [Connection lifecycle rules](#connection-lifecycle-rules).

## Flows

### Find a match

```text
A: join_chat(...)            → ack {status: "queued"}
B: join_chat(...)            → match_found {partner: A}   then ack {status: "matched"}
A:                           ← match_found {partner: B}
```

### Chat

```text
A: send_message("hi")        → B ← receive_message {message: "hi"}
A: typing / typing_stop      → B ← partner_typing / partner_typing_stop
```

### Skip

```text
A: skip_chat()
A: ← chat_ended {reason: "skipped", by: "self"}
B: ← chat_ended {reason: "skipped", by: "partner"}
A: ← match_found {partner: C}   or   queued {partner: null}
B: ← match_found {partner: D}   or   queued {partner: null}
```

A and B won't be matched with each other again for 20s.

### Matched with someone who just left

The server only learns about a closed connection when its disconnect is processed, so a user who left a moment ago can still be matched. In that case the client gets `match_found` followed almost immediately by `chat_ended {reason: "disconnected", by: "partner"}`. Handle it like any other partner disconnect.

### End

```text
A: end_chat()
A: ← chat_ended {reason: "ended", by: "self"}
B: ← chat_ended {reason: "ended", by: "partner"}      (B is not requeued)
```

### Partner disconnects

```text
A's app goes to the background / closes / loses network
B: ← chat_ended {reason: "disconnected", by: "partner"}   (B is not requeued)
A: nothing from the server (A's socket is gone)
```

## Connection lifecycle rules

The OS closes the socket whenever the app goes to the background, the screen locks, or the app is closed. The server then **ends the chat or search immediately** and doesn't keep any state for that connection.

1. **The server never resumes a session.** After any reconnect, the client is a new, idle user: not queued, not in a chat.
2. **Reset the chat UI on the client's own `disconnect` event**, and when the app returns to the foreground, whether or not the socket had to reconnect. The server can't tell a closed connection that its chat ended.
3. **On `chat_ended` with `by: "partner"`** (`ended` or `disconnected`), call `join_chat` again, or offer to. Only a skip requeues automatically.
4. **On `error {reason: "not_in_chat"}`**, reset the chat UI. It's the backup for a missed disconnect.
5. **Use an `auth` callback** so reconnects send a fresh access token. The access token lasts 30 minutes, and an expired one is refused with `401 invalid_token`: refresh the token, then reconnect.
6. **Back off** on `429 rate_limited` and `503 unavailable`. The connect limit allows 20 quick reconnects per device, then about 6 per minute, which covers normal background/foreground switching.

## Rate limits

HTTP limits are **per client IP** (`X-Real-IP` / `X-Forwarded-For`). Socket limits are **per device** (`device_id` from the token). A token bucket allows a burst up to its capacity, then refills at the given rate.

| Endpoint / event | Algorithm | Limit |
|---|---|---|
| `POST /captcha/get-started` | sliding window | 20 per 60s |
| `POST /captcha/verify` | token bucket | burst 5, then 1 per ~30s |
| `POST /jwt/refresh` | sliding window | 15 per 60s |
| socket connect | token bucket | burst 20, then 1 per ~10s |
| `join_chat` | token bucket | burst 5, then 1 per ~15s |
| `send_message` | token bucket | burst 20, then 2 per second |
| `skip_chat` | token bucket | burst 3, then 1 per ~30s |
| `end_chat` | token bucket | burst 5, then 1 per ~12s |
| `typing` | token bucket | burst 10, then 1 per 5s |
| `typing_stop` | token bucket | burst 50, then 1 per 5s |

The values come from `RateLimitSettings` in `src/anonyverse/core/settings.py`. Each deployment can override them through environment variables.

## Known issues

These are real behaviours today. Clients should handle them until they're fixed.

- **`join_chat` with no allowed tags** raises on the server, and no ack is sent. Always use an ack timeout.
- **A server-side matching error** can make `join_chat` ack `queued` even though the user isn't in the queue, so no `match_found` will ever come. Consider a search timeout in the app, after which it calls `join_chat` again.

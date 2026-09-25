# App journey map

A visual map of what the app does today, and which file does each part. It's meant for debugging. All paths are relative to `anonyverse/src/`. The backend contract is in [api.md](api.md).

- [1. Mind map](#1-mind-map)
- [2. User journey](#2-user-journey)
- [3. Who does what](#3-who-does-what)
- [4. Auth and session](#4-auth-and-session)
- [5. Matchmaking loop (`findMatch`)](#5-matchmaking-loop-findmatch)
- [6. Finding Match states](#6-finding-match-states)
- [7. Chat states](#7-chat-states)
- [8. Server event → handler](#8-server-event--handler)
- [9. Debugging cheat sheet](#9-debugging-cheat-sheet)

---

## 1. Mind map

```mermaid
mindmap
  root((Anonyverse app))
    Entry
      useEntryController
      get-started
      new or returning user
    Verification
      useVerificationController
      useTurnstile WebView
      captcha verify
      max 2 attempts
    Onboarding steps
      MoodSelect good or low
      Topics tags and opt-in
      FindingMatch
        useFindingMatchController
        findMatch loop
      Chat
        useChatController
        FindingNewMatchModal
        LeaveChatConfirmModal
    ChatList
      Start a chat
    Services
      restAuthService
      tokenProvider
      inMemorySessionStore
      secureDeviceIdentityService
      socketIoChatSocketService
      findMatch
    Cross-cutting
      useAppForeground
      useCrossfade
      PostHog analytics
      DevMenu in DEV builds
```

---

## 2. User journey

Solid boxes are real stack routes. Dashed boxes are **steps rendered in place** inside a route, crossfaded by `useCrossfade` rather than pushed.

```mermaid
flowchart TD
    Start([App launch]) --> Entry["Entry route<br/>EntryScreen"]

    Entry -->|no device id| FirstTime{{"Let's start"}}
    Entry -->|get-started: verified| ChatList
    Entry -->|get-started: not verified / failed| FirstTime
    FirstTime --> Verification

    subgraph VR["Verification route: first-time flow"]
        Verification["VerificationScreen<br/>Turnstile captcha"] -->|verified| MS1
        MS1["MoodSelect<br/>with progress bar"]:::step --> T1["Topics"]:::step
        T1 -->|Find someone| FM1["FindingMatch"]:::step
        FM1 -->|close| T1
        FM1 -->|matched| C1["Chat"]:::step
    end

    ChatList["ChatList route"] -->|Start a chat| MSR

    subgraph MR["MoodSelect route: returning-user flow"]
        MSR["MoodSelect<br/>no progress bar"]:::step --> T2["Topics"]:::step
        T2 -->|Find someone| FM2["FindingMatch"]:::step
        FM2 -->|close| T2
        FM2 -->|matched| C2["Chat"]:::step
    end

    C1 -->|Stop searching / gave up| ChatList
    C2 -->|Stop searching / gave up| ChatList

    classDef step stroke-dasharray: 5 5
```

> From any FindingMatch or Chat step: if the session can't be refreshed, `navigation.reset` sends the user back to **Entry**.

Where it lives: `navigation/RootNavigator.tsx` (`EntryRoute`, `VerificationRoute`, `ChatListRoute`, `MoodSelectRoute`, `useResetToEntry`).

---

## 3. Who does what

Screens render. Controllers (`use*Controller`) hold the logic. Services talk to the backend.

```mermaid
flowchart LR
    subgraph Screens
        ES[EntryScreen]
        VS[VerificationScreen]
        FMS[FindingMatchScreen]
        CS[ChatScreen]
        NMM[FindingNewMatchModal]
        LCM[LeaveChatConfirmModal]
    end

    subgraph Controllers
        EC[useEntryController]
        VC[useVerificationController]
        FMC[useFindingMatchController]
        CC[useChatController]
    end

    subgraph Services
        AUTH[restAuthService]
        DEV[secureDeviceIdentityService]
        SESS[inMemorySessionStore]
        TP[tokenProvider]
        TS[useTurnstile]
        FM[findMatch]
        SOCK[socketIoChatSocketService]
        HTTP[httpClient.postJson]
    end

    ES --> EC
    VS --> VC
    FMS --> FMC
    CS --> CC
    CS --> NMM & LCM

    EC --> DEV & AUTH & SESS
    VC --> TS & DEV & AUTH & SESS
    FMC --> FM & SOCK
    CC --> FM & SOCK

    FM --> TP & SOCK
    TP --> SESS & AUTH
    AUTH --> HTTP
    HTTP -->|REST /api/v1| BE[(anonyverse-core)]
    SOCK -->|Socket.IO websocket| BE
```

| Piece | File | Responsibility |
|---|---|---|
| `useEntryController` | `screens/entry/` | Decides whether the user is new or returning, calls `get-started`, stores the token |
| `useVerificationController` | `screens/verification/` | Turnstile → `captcha/verify` → stores the token and device id. Allows 2 attempts |
| `useFindingMatchController` | `screens/findingMatch/` | First search. Hands the **live socket** to Chat after a 1.2s "matched" card |
| `useChatController` | `screens/chat/` | Messages, typing, replies, skip, rematching, resuming after a drop, the leave confirmation |
| `findMatch` | `services/chatSocket/findMatch.ts` | Connect, join, wait for a match, and all retry rules. Shared by both controllers above |
| `socketIoChatSocketService` | `services/chatSocket/` | Thin Socket.IO wrapper: events in, emits out, mood mapped for the server (`toBackendMood`: low → `fl`). No retry logic |
| `tokenProvider` | `services/session/tokenProvider.ts` | Returns a fresh access token, refreshing when needed (only one refresh at a time) |
| `inMemorySessionStore` | `services/session/` | Holds the token pair in memory and answers "is it expired?" |
| `restAuthService` | `services/auth/` | `get-started`, `verify`, `refresh` → typed outcomes |
| `httpClient` | `services/api/` | `fetch` wrapper. Refuses non-https URLs in production (`config/env.ts`) |
| `useAppForeground` | `hooks/` | Calls back when the app goes from background to active |

---

## 4. Auth and session

### Getting a session

```mermaid
sequenceDiagram
    participant E as useEntryController
    participant V as useVerificationController
    participant D as DeviceIdentity
    participant A as restAuthService
    participant S as SessionStore
    participant B as Backend

    E->>D: getDeviceId()
    alt no device id
        E-->>E: show "Let's start" → Verification
    else has device id
        E->>A: getStarted(deviceId)
        A->>B: POST /captcha/get-started
        alt verified
            B-->>A: token
            E->>S: setToken
            E-->>E: → ChatList
        else not verified or failed
            E-->>E: show "Let's start" → Verification
        end
    end

    V->>V: Turnstile WebView → token
    V->>A: verify(deviceId, turnstileToken)
    A->>B: POST /captcha/verify
    B-->>A: token + device
    V->>D: setDeviceId (if new)
    V->>S: setToken
```

### Keeping it fresh

Tokens: the access token lasts 30 minutes and the refresh token lasts 4 hours. **Every refresh rotates the refresh token.**

```mermaid
flowchart TD
    Q["tokenProvider.getFreshAccessToken()"] --> H{token stored?}
    H -->|no| RA[reauth_required]
    H -->|yes| X{"access expires<br/>within 60s?<br/>or forceRefresh"}
    X -->|no| OK[ok: stored token]
    X -->|yes| IF{refresh already<br/>in flight?}
    IF -->|yes| SH[share that promise]
    IF -->|no| RE{refresh token<br/>expired?}
    RE -->|yes| CLR[clear session] --> RA
    RE -->|no| POST["POST /jwt/refresh"]
    POST -->|200| SAVE[store NEW pair] --> OK2[ok: new token]
    POST -->|401| CLR
    POST -->|429 / 5xx / network| F["failed<br/>(caller backs off)"]
    RA --> NAV(["controller → onReauthRequired<br/>→ reset to Entry"])
```

---

## 5. Matchmaking loop (`findMatch`)

This one function handles every "connection went wrong" rule in the contract. Callers stop it by aborting the `AbortSignal` they passed in, which also ends any wait in progress. They close the socket themselves.

It never re-sends `join_chat` while queued: an ok ack holds our place, and `join_chat` is rate limited.

```mermaid
flowchart TD
    S([findMatch]) --> C{needs<br/>connect?}
    C -->|no| J
    C -->|yes| T[getFreshAccessToken]
    T -->|reauth_required| R1([reauth_required])
    T -->|failed| BO1[backOff] --> C
    T -->|ok| CON[service.connect]
    CON -->|ok| J
    CON -->|AUTH_ERROR, first time| FR[forceRefresh = true] --> C
    CON -->|AUTH_ERROR after refresh| F1([failed])
    CON -->|RATE_LIMITED| W10[wait 10s] --> C
    CON -->|timeout / 503 / other| BO2[backOff] --> C

    J["join_chat(tags, mood, optedIn)<br/>then wait"] --> O{outcome}
    O -->|match_found| M([matched])
    O -->|ack rate_limited| W15[onRateLimited + wait 15s] --> J
    O -->|no ack / offline / connection lost| NC[needs connect] --> BO3[backOff] --> C
    O -->|signal aborted| X([cancelled])

    BO1 & BO2 & BO3 -.->|4 failures in a row| F2([failed])
```

| Constant | Value | Why |
|---|---|---|
| `MAX_FAILED_ATTEMPTS` | 4 in a row | Stops retrying after this. Rate-limit waits don't count. Reset once a join is accepted |
| Backoff | 1s → 2s → 4s (max 8s) | Retry delay for 503s and network errors |
| `CONNECT_RATE_LIMIT_WAIT_MS` | 10s | Refill time of the server's connect bucket |
| `JOIN_RATE_LIMIT_WAIT_MS` | 15s | Refill time of the server's `join_chat` bucket |
| `JOIN_CHAT_TIMEOUT_MS` | 10s | Known server bug: no ack if no tag is allowed |
| `CONNECTION_TIMEOUT_MS` | 10s | Handshake timeout |

---

## 6. Finding Match states

```mermaid
stateDiagram-v2
    [*] --> connecting
    connecting --> searching: socket up, join_chat sent
    searching --> matched: match_found
    matched --> Chat: after 1.2s → onMatched(service)
    matched --> searching: partner left during the 1.2s
    matched --> connecting: socket dropped during the 1.2s
    connecting --> error: findMatch failed
    searching --> error: findMatch failed
    connecting --> Entry: reauth_required
    searching --> Entry: reauth_required

    connecting --> connecting: app back from background
    searching --> connecting: app back from background
    note right of searching
        × close → end_chat + disconnect
        → back to Topics.
        No handoff after close.
    end note
```

`FindingMatchScreen` shows "Finding a connection" for `connecting` and `searching`, a success card for `matched`, and an error card for `error`.

---

## 7. Chat states

`rematchState` in `useChatController` is `idle` or `rematching`. While `rematching`, `FindingNewMatchModal` covers the chat, and `rematchReason` picks its subtext.

```mermaid
stateDiagram-v2
    [*] --> idle: mounted with the socket from FindingMatch

    idle --> rematching: chat_ended skipped (you_skipped / partner_skipped)
    idle --> rematching: chat_ended ended or disconnected by partner (partner_ended)
    idle --> rematching: connection lost / app foregrounded / error not_in_chat (reconnecting)

    rematching --> idle: match_found
    rematching --> rematching: connection lost after a skip (reconnecting)

    idle --> [*]: Leave chat (confirm popup) / unmount
    rematching --> [*]: Stop searching, or reauth → Entry
```

| `rematchReason` | Modal subtext | Who rejoins? |
|---|---|---|
| `you_skipped` / `partner_skipped` | "You skipped the chat…" / "Your partner skipped you…" | **Server** requeues both users. The client never sends `join_chat` here, and `queued` needs no handler |
| `partner_ended` | "Your partner has ended the chat…" | **Client**: `findMatch` on the same socket |
| `reconnecting` | "You were disconnected, finding a new partner" | **Client**: new socket and fresh token, then `findMatch` |

While a client rejoin runs, the modal's status line shows "Matchmaking is busy…" during a rate-limit wait, and switches to the error style ("Couldn't find a new match…", `rematchGaveUp`) once `findMatch` gives up. A connection lost in the background is picked up by the foreground listener instead, so the reconnect isn't killed again.

Any `match_found` resets the thread to "Connected with anonymous partner. Say Hi!", clears the reply, and restarts the 10s skip lock.

---

## 8. Server event → handler

```mermaid
flowchart LR
    subgraph Server events
        mf[match_found]
        q[queued]
        ce[chat_ended]
        rm[receive_message]
        pt[partner_typing / _stop]
        er[error]
        dc["disconnect<br/>(onConnectionLost)"]
    end

    mf --> FMa["findMatch → matched"]
    mf --> CCa["Chat: reset thread, idle"]
    q --> none["no handler: modal already shown"]
    ce --> CCb["Chat: rematching<br/>(skip: wait; partner ended: rejoin)"]
    ce --> FMb["FindingMatch: cancel handoff"]
    rm --> CCc["Chat: append message<br/>(parses reply envelope)"]
    pt --> CCd["Chat: typing dots<br/>(auto-clear after 4s)"]
    er --> CCe["Chat: 409 not_in_chat → resume,<br/>429 → toast"]
    dc --> FMc["findMatch: reconnect"]
    dc --> CCf["Chat: resume, unless a findMatch<br/>loop is already recovering"]
```

| Client → server | Sent by | When |
|---|---|---|
| `join_chat` | `findMatch` | First search, rejoin after the partner ended, reconnect. **Never after a skip** |
| `send_message` | `handleSend` | Plain text, or the JSON `{text, replyTo}` envelope (falls back to plain text if over 2000 characters) |
| `typing` / `typing_stop` | `setInputValue` | `typing_stop` after 4s idle, on send, or when the input is cleared |
| `skip_chat` | `handleSkip` | After the 10s lock. Client-side limit: 3, then one per 30s |
| `end_chat` | `handleConfirmLeave`, FindingMatch `handleClose` | Followed right away by disconnect |

---

## 9. Debugging cheat sheet

### Symptom → where to look

```mermaid
flowchart TD
    A{What's wrong?}
    A -->|Always sent to Verification| A1["useEntryController<br/>get-started outcome.<br/>A new app_version means a new captcha"]
    A -->|Captcha never completes| A2["useTurnstile + [Turnstile] logs<br/>SITE_KEY in .env"]
    A -->|Stuck on Finding a connection| A3["findMatch: join ack?<br/>tags allowed? acked queued but server<br/>lost us (api.md Known issues)"]
    A -->|Error card on FindingMatch| A4["error.reason:<br/>AUTH_ERROR → token<br/>RATE_LIMITED / UNAVAILABLE → server<br/>CONNECTION_TIMEOUT → network"]
    A -->|Kicked back to Entry| A5["tokenProvider → reauth_required<br/>refresh 401 or refresh token expired"]
    A -->|Low mood never matches| A6["toBackendMood: low → fl<br/>partner must have optedIn"]
    A -->|Modal never goes away| A7["rematchState + match_found.<br/>skipped: waits on the server's requeue"]
    A -->|Messages not arriving| A8["receive_message listener in useChatController.<br/>Over 2000 characters is dropped silently by the server"]
    A -->|Every request fails in release| A9["API_BASE_URL must be https://<br/>isApiBaseUrlSecure in config/env.ts"]
```

### Log prefixes

| Prefix | Source |
|---|---|
| `[Entry]` | `useEntryController` |
| `[Verification]` / `[Turnstile]` | `useVerificationController` / `useTurnstile` |
| `[FindingMatch]` | `useFindingMatchController` |
| `[Chat]` | `useChatController` |
| `[env]` | `config/env.ts`: missing env values, non-https URL |
| `[DevChat]` | the no-op socket used by the DEV menu's Chat preview |

### PostHog events

```mermaid
flowchart LR
    e1[app_launched] --> e2[verification_started] --> e3{{verification_succeeded / _failed}}
    e3 --> e4["mood_selected<br/>{mood, is_first_time}"] --> e5["topic_selected<br/>{topics}"]
    e5 --> e6["match_search_started<br/>{topics}"] --> e7["match_found<br/>{topics, wait_duration_ms}"]
```

### Dev menu (DEV builds, the floating **DEV** button)

It opens any screen on its own. **Chat** and **Finding New Match modal** are UI previews that use a no-op socket. **Finding Match** connects for real, and sends you back to Entry if there's no session.

# Anonyverse Frontend — User Flows

## 1. Purpose

This document defines the intended user journeys for the new Anonyverse React Native frontend.

It is a product-flow specification, not an implementation guide.

### Source of truth

- `api.md` defines backend/API contracts.
- Figma defines visual design and interaction details.
- This document defines navigation and user journey behavior.
- When details are missing, do not invent behavior. Flag the ambiguity.

---

## 2. Entry / App Bootstrap

The Entry screen is shown when the app launches.

The app checks for the secure device ID to determine whether this is a first-time or returning user.

### First launch / first-time user

If the secure device ID does not exist, the Entry screen shows a **"Let's start"** CTA.

The user must tap **"Let's start"** to begin the first-time journey.

```text
App Launch
   ↓
Entry Screen
   ↓
User taps "Let's start"
   ↓
Verification
```

### Returning user

If the secure device ID already exists, the user should not be required to tap **"Let's start"** again.

The app automatically proceeds from Entry to Chat List after the required bootstrap checks.

```text
App Launch
   ↓
Entry Screen
   ↓
Secure Device ID exists
   ↓
Automatic transition
   ↓
Chat List
```

There is **no active-conversation routing on app launch**. The application always takes returning users to Chat List.

The Entry screen is therefore:

- a one-time interactive gateway for first-time users
- a brief automatic gateway for returning users

---

## 3. First-Time User Flow

A first-time user is identified by the absence of a secure device ID.

```text
Entry
  ↓
Let's start
  ↓
Verification
  ↓
Verification Success
  ↓
Mood Check
  ↓
Finding Someone
  ↓
Connection Found / Pre-Chat
  ↓
Chat
  ↓
Chat Closed / Ended
  ↓
Chat List
```

### 3.1 Verification

The user completes the required human/device verification flow.

Successful verification leads directly to the Mood Check.

The user must **not** be sent to Chat List after completing first-time verification.

### 3.2 Verification Success

Show the verification-success experience before entering Mood Check.

Purpose:

- Confirm that verification succeeded.
- Maintain the friendly Anonyverse tone.
- Transition naturally into the core experience.

Next destination:

```text
Verification Success → Mood Check
```

### 3.3 Mood Check

The user selects their current mood/intention as defined by the Figma design.

The selected mood becomes input to the matching flow.

```text
Mood Check
    ↓
Find Someone
```

Do not treat Mood Check as a generic onboarding form. It is the beginning of the user's first connection journey.

### 3.4 Finding Someone

The app starts the matching process.

The UI reflects the matching/searching state defined in Figma.

Possible backend/API/WebSocket behavior must come from `api.md`; do not invent endpoint contracts.

### 3.5 Connection Found / Pre-Chat

When a connection is established, show the designed connection-found/pre-chat state if one exists in Figma.

Next:

```text
Connection Found
      ↓
     Chat
```

### 3.6 Chat

The user enters the anonymous conversation.

Live chat behavior uses the backend/WebSocket contract defined in `api.md`.

### 3.7 Chat End / Close

When the live chat ends or is closed:

```text
Chat
  ↓
Chat Closed / Ended state
  ↓
Chat List
```

The user is returned to Chat List. They are not automatically sent back to Mood Check.

---

## 4. Returning User Flow

A returning user is identified by the existence of a secure device ID.

The returning-user flow is intentionally simple:

```text
Entry
  ↓
Secure Device ID exists
  ↓
Automatic transition
  ↓
Chat List
```

Chat List is the primary home experience for returning users.

There is no separate active-chat destination when the app launches.

Because the chat is a live WebSocket session, the user always enters the app through Chat List on subsequent launches.

---

## 5. Chat List

Chat List contains the user's existing/saved conversations according to the backend contract.

From Chat List the user can:

```text
Existing chat
    ↓
   Chat
```

or:

```text
Start Chat
    ↓
 Mood Check
    ↓
 Finding Someone
    ↓
 Connection Found / Pre-Chat
    ↓
 Chat
```

The Start Chat flow reuses the same Mood → Matching → Chat journey used after first-time verification.

Do not duplicate the matching experience unnecessarily.

---

## 6. App Relaunch Behaviour

On every app launch:

```text
App Launch
   ↓
Entry
   ↓
Check secure device ID
   ├── No secure device ID → First-time flow after "Let's start"
   └── Secure device ID exists → Chat List automatically
```

There is no requirement to detect or reopen an active conversation from the Entry flow.

The user's chat is a live WebSocket session, and the normal returning destination is always Chat List.

---

## 7. Overall Navigation Model

```text
                         APP LAUNCH
                             ↓
                           Entry
                             ↓
                    Secure Device ID Check
                       /                  \
                      /                    \
             FIRST TIME              RETURNING
                  ↓                        ↓
            "Let's start"             Chat List
                  ↓
             Verification
                  ↓
        Verification Success
                  ↓
             Mood Check
                  ↓
          Finding Someone
                  ↓
       Connection Found / Pre-Chat
                  ↓
                Chat
                  ↓
        Chat Closed / Ended
                  ↓
             Chat List
```

From Chat List:

```text
Chat List
   ├── Existing Chat → Chat
   └── Start Chat → Mood Check → Finding Someone → Chat
```

---

## 8. Route / Navigation Principles

1. **First-time Entry has a "Let's start" CTA.** It is required only when no secure device ID exists.
2. **Returning Entry does not require a CTA.** Returning users transition automatically to Chat List.
3. **Chat List is not the first destination for a first-time user.**
4. **First-time users go directly from verification success into Mood Check.**
5. **Returning users always land on Chat List.**
6. **There is no active-conversation routing on app launch.**
7. **After a chat ends, return to Chat List.**
8. **Starting a new conversation from Chat List begins at Mood Check.**
9. Avoid unnecessary intermediate screens.
10. Do not create duplicate screens when the same state/component can be reused.
11. Navigation decisions should use authoritative application/backend state where applicable.

---

## 9. State Model

At a high level, the app needs to distinguish these entry states:

```text
BOOTSTRAPPING
      ↓
┌───────────────┬────────────────┐
│ FIRST_TIME    │ RETURNING      │
└───────┬───────┴───────┬────────┘
        │               │
        ↓               ↓
   Let's start      Chat List
        │
        ↓
  Verification
        ↓
      Mood
        ↓
   Matching
        ↓
      Chat
        ↓
 Chat Closed
        ↓
   Chat List
```

### Important distinction

- **First-time** is determined by the absence of a secure device ID.
- **Returning** is determined by the existence of a secure device ID.
- There is **no active-chat route-resolution state** on app launch.
- The chat itself is a live WebSocket session; reopening the app routes the user to Chat List.

---

## 10. Error / Exceptional States

Every major flow should account for the states represented by the actual API and Figma specifications.

Examples include:

- bootstrap failure
- verification failure
- matching failure
- matching timeout
- connection failure
- chat connection lost
- chat ended
- API error
- retry

Do not invent UI or backend behavior for these states until the relevant API/Figma specification is known.

---

## 11. Implementation Boundary

This flow document defines **where the user should go**.

It does not define:

- API request formats
- API response schemas
- WebSocket payloads
- database behavior
- authentication implementation details
- exact visual styling

Those belong to `api.md`, the architecture documentation, and the Figma design.

---

## 12. Implementation Rule for Claude

When implementing this application:

> Follow this flow exactly. Use `api.md` for backend behavior and Figma for visual/interaction design. Do not infer missing product behavior. When a required behavior is not defined, stop and report the ambiguity rather than inventing an implementation.

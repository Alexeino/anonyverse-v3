# Anonyverse Mobile — Frontend Architecture

## 1. Purpose

This document defines the architecture for the **new Anonyverse React Native frontend**.

This is a **greenfield frontend project**. It must not depend on or copy the existing frontend implementation. The existing backend remains the source of truth for API behavior, and `docs/api.md` is the frontend-facing API contract.

### Source of truth

| Concern | Source of truth |
|---|---|
| Visual design, layouts, UX | Figma via Figma MCP |
| Backend endpoints, payloads, responses | `docs/api.md` |
| Frontend architecture | This document |
| Product/screen flow | Figma + `docs/screens.md` |
| Runtime behavior not specified | Do not guess; flag ambiguity |

**Rule:** Never invent an endpoint, payload, response field, WebSocket event, navigation rule, or business rule. If it is missing from `api.md` or the approved product flow, explicitly report the gap.

---

## 2. Recommended Technology Stack

- **React Native** — bare React Native / Community CLI; no Expo runtime dependency.
- **TypeScript** — strict typing for application code.
- **React Navigation** — native stack/navigation primitives.
- **Zustand** — lightweight client/application state.
- **TanStack Query** — server state, caching, mutations, invalidation and request lifecycle.
- **React Native Reanimated** — UI animation and transitions.
- **React Native Gesture Handler** — gestures and interactive sheets.
- **React Native SVG** — vector icons/illustrations where appropriate.
- **Rive** — animated Mili/Milo assets where an animation is required.
- **StyleSheet + design tokens** — styling system based on the Figma design system.
- **WebSocket** — real-time chat/matching events, based on the contract in `api.md`.

Avoid adding libraries for functionality already covered by the above stack unless there is a concrete requirement.

---

## 3. High-Level Architecture

```text
┌─────────────────────────────────────────────┐
│                 UI / Screens                │
│  Entry • Verification • Mood • Match • Chat│
└──────────────────────┬──────────────────────┘
                       │
                Hooks / View Models
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   Zustand       TanStack Query   WebSocket Service
  client state    server state     realtime events
        │              │              │
        └──────────────┼──────────────┘
                       ▼
                 Service / API Layer
                       │
                       ▼
                 Backend APIs
                       │
                       ▼
               Anonyverse Backend
```

The UI should consume **typed hooks/services**, not construct raw HTTP requests or WebSocket messages inside screen components.

---

## 4. Separation of Responsibilities

### Screens

Screens are responsible for composition and user interaction. They should remain relatively thin.

A screen should:

- Render components.
- Read state/query data through hooks.
- Trigger actions through hooks/services.
- Handle navigation decisions that are specific to that screen.

A screen should **not** contain:

- Raw API calls.
- WebSocket connection implementation.
- Large business rules.
- Duplicated styling constants.
- Hard-coded backend assumptions.

### Components

Reusable visual building blocks belong in `components/`.

Examples from the Figma system:

- Primary button
- Secondary button
- Mood card
- Mood chip
- Safe-space card
- Status card
- Chat bubble
- Top bar
- Progress indicator
- Bottom action area
- Modal/sheet content
- Mascot presentation

Components should be reusable without knowing which screen owns them.

### Services

Services encapsulate communication and platform/application behavior.

Examples:

- `authService`
- `matchingService`
- `chatService`
- `reportService`
- `webSocketService`

All endpoint details must come from `docs/api.md`.

### Stores

Use Zustand only for **client/application state** that needs to live outside a single component tree.

Examples:

- authentication/session state
- current user context
- active chat context
- current matching session state
- app-level UI state

Do not copy every API response into Zustand. Prefer TanStack Query for server state.

### TanStack Query

Use TanStack Query for request-driven server state:

- chat lists
- chat details
- user/profile data
- server-backed matching status where applicable
- report/block mutation status
- other REST resources defined in `api.md`

Use query invalidation or updates instead of manually synchronizing duplicate state.

### WebSocket

Keep WebSocket implementation in a dedicated service/hook layer.

```text
WebSocket Service
      ↓
 event parser / typed events
      ↓
 application state + query cache
      ↓
 UI
```

Do not open/close raw sockets directly from multiple screens.

---

## 5. Navigation Architecture

Navigation should be state-driven rather than based solely on which screen happens to be open.

### Root decision tree

```text
                    APP OPEN
                       │
                 Authenticated?
                 /             \
               NO               YES
               │                 │
             Entry       First session complete?
                              /          \
                            NO            YES
                            │              │
                    First Session Flow   Active chat?
                                           /    \
                                         YES     NO
                                          │       │
                                         Chat   Chat List
```

The exact authentication condition and session persistence rules must be implemented according to `api.md` and the approved product requirements.

### First-session flow

The first verified session is intentionally **not** sent to Chat List.

```text
App launch
  ↓
User Clicks Let's start
  ↓
Device id doesn't exist
  ↓
Verification — waiting
  ↓
Verification — cleared
  ↓
Mood Check
  ↓
Finding a Connection
  ↓
Pre-chat / Safety reminder (if applicable)
  ↓
Chat
```

The purpose is to get a first-time user to the core Anonyverse experience with minimal friction.

### Returning-user flow

```text
App launch
  ↓
Device ID does exist
  ↓
Chat List
  │
  ├── Existing / active chat → Chat
  │
  └── Start a chat → Mood Check
                         ↓
                    Finding Connection
                         ↓
                    Pre-chat / Safety reminder
                         ↓
                        Chat
```

When a conversation ends:

```text
Chat
  ↓
Chat Closed
  ↓
Chat List
```

If the product later defines a different termination behavior, update the product-flow specification before changing navigation code.

---

## 6. Screen Architecture

The current Figma flows establish these primary screen/state groups.

### Entry

Purpose: introduce Anonyverse and invite the user to begin.

### Verification

States shown in the design:

- verification in progress
- verification successful

### Mood Check

Purpose: determine the user's current mood/context before matching.

The design supports different mood presentations, including Mili/Milo variants and selectable mood/category chips.

### Finding a Connection

Purpose: communicate that matching is in progress and make waiting feel intentional rather than empty.

### Pre-chat / safety reminder

The design includes a short "three things before you start" style reminder before entering a conversation.

### Chat

Primary real-time conversation experience.

### Finding Someone New

Used after a user chooses to look for another connection from a closed conversation.

### Report

Presented as a dedicated report interaction/modal/sheet while preserving the underlying chat context.

### Chat Closed

Explains that the conversation has ended and provides the next action, including returning to the chat list or starting another conversation.

### Chat List

Primary home destination for returning users after their first experience.

The current second-session design also contains the empty/saved-chat state with a prominent **Start a chat** CTA.

---
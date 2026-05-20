# Merge: `tf-dev` → `main`

This branch (`merge/tf-dev-into-main`) is the result of merging `origin/tf-dev`
into `origin/main`. Roman, please review the per-file resolutions below and
either land it as-is or push amendments before merging into `main`.

Total auto-merged files: **20+** (clean, no review needed).
Total conflicts resolved: **17** regions across 7 src files + trivial files.

---

## Quick summary

The `tf-dev` branch carried a set of stability + UX fixes that all of `main`'s
recent work either supersedes (better refactor) or co-exists with (additive,
non-overlapping). For all conflicts I picked **`main`'s version** when both
sides had divergent intent (your refactors are universally better-structured),
and **`tf-dev`'s version** when the surface was non-overlapping or strictly
additive (crash hardening, broadcast/avatar fixes).

Each kept-from-`main` decision is annotated inline in the source with a
`// Took main's ... over tf-dev's ...` or `// TODO(merge from tf-dev): ...`
comment so you can search for `merge from tf-dev` to find the points that
might want a second look.

---

## What `tf-dev` brings (auto-merged, no review needed)

These landed cleanly and are the main value of the merge:

| Area | Files | What |
|---|---|---|
| **Avatar field name** | `src/networking/xmpp/sendTextMessage.xmpp.ts` | Outgoing user messages now stamp BOTH `photo` and `photoURL` in the `<data>` element. `getDataFromXml.ts` reads from `photo` so this fixes the long-standing avatar-not-rendering bug for regular user messages. Forward+backward compatible. |
| **"Deleted User" anti-stickiness** | `src/roomStore/roomsSlice.ts` | `enrichMessageAuthor` now honours `<data fullName / senderFirstName / senderLastName>` from incoming stanzas, treats a previously-set "Deleted User" as unresolved, and re-enriches stale messages once usersSet hydrates. Targets server-side broadcasts + freshly-invited AI bots that don't have a `usersSet` entry on first render. (See backend commit `49199a453 feat(broadcast): stamp sender identity` for the matching server-side stamping.) |
| **Crash hardening** | `src/components/MainComponents/RoomList.tsx` (`safeChats` filter), `src/components/RoomComponents/ChatRoomItem.tsx` (defensive `chat?.messages?.length ?? 0`) | Guards against persisted Redux state with null entries / undefined `messages` arrays — was unwinding the router subtree on rehydrate. |
| **Persisted-room recovery** | `src/hooks/useChatWrapperInit.ts`, `src/networking/xmppClient.ts` | Hardens recovery from persisted state where the room list rehydrates faster than the XMPP session. |
| **Private chat presence** | `src/networking/xmpp/presenceInRoom.xmpp.ts`, `src/networking/xmpp/subscribeToRoomMessages.xmpp.ts` | Restores MUC presence + history on fresh private-chat creation. |
| **Legacy room history** | `src/networking/xmppClient.ts` | Recovers sender ids from legacy room history that doesn't carry the modern identity payload. |
| **Firebase guard** | `src/firebase-config.ts` | Skips eager Firebase init when config is incomplete (multi-tenant deploys without Firebase). |
| **Defaults** | `src/api.config.ts`, `src/config.ts`, `src/helpers/constants/PLATFORM_CONSTANTS.ts` | Defaults to `chat.ethora.com` hosts post-prod-migration. |
| **Custom-login route** | `src/components/AuthForms/Login.tsx`, `src/components/MainComponents/LoginWrapper.tsx` | Custom login path for embedded integrations. |
| **Embed-mode UI tweaks** | `src/AppWithNav.tsx`, `src/components/Modals/UserProfileModal/UserProfileModal.tsx`, `src/networking/api-requests/auth.api.ts` | Surface improvements for the embedded SDK consumers. |

---

## Conflicts I resolved (per-file rationale)

### Trivial (took `main`)

- **`src/version.ts`** — kept `26.02.22` (your numbering scheme).
- **`package.json`** — kept `26.2.28`.
- **`package-lock.json`** — kept main's lockfile.
- **`lib/*` (8 files)** — took main's compiled output; `npm run prepare`
  will regenerate after you accept this merge.
- **`public/firebase-messaging-sw.js`** — kept main's `/* global clients */`
  (you've removed `firebase` and `importScripts` references that tf-dev still
  declared).

### Substantive — took `main` (your refactor wins)

Each of these has the explanation inline in the source as a code comment.

- **`src/App.tsx`** — kept `wss://xmpp.chat.ethora.com/ws` (port 443) over
  tf-dev's `:5443/ws`. Production routing on 443 is correct post-migration.
- **`src/components/MainComponents/LoginWrapper.tsx`** — kept your
  `ensureUserFromMy(loginData)` over tf-dev's direct `dispatch(setUser(loginData))`.
  Your `/my`-endpoint normalization is **exactly** the fix you mentioned in
  Slack for the "`/user` returning undefined → Deleted User" thread, so this
  preserves it intentionally.
- **`src/components/MainComponents/RoomList.tsx`** — kept your
  `getRoomActivityTimestamp(...)` helper over tf-dev's inline
  `getLastMessageId / createdAt` fallback chain. **Kept tf-dev's `safeChats`
  null-entry filter** (auto-merged in); the conflict was only in the sort
  comparator.
- **`src/context/xmppProvider.tsx`** (5 regions) — kept your bootstrap-key
  tracking (`completedInitBeforeLoadKeyRef` + `inFlightInitBeforeLoadKeyRef`)
  over tf-dev's simpler `initBeforeLoadPromiseRef + clientRef` pattern. Your
  per-key tracking is the more robust approach for preventing reentrant init.
  Imports for `usePushNotifications` (main) and `setChatConfig` (tf-dev) were
  collated — both are used post-merge.
  - **`TODO(merge from tf-dev)`** flagged inline: tf-dev introduced a
    `setProviderBootstrapStatus('running' | 'ready')` status enum that's a
    nice UX signal. Dropped here because the setter requires a state field
    that doesn't exist in main yet — worth re-adding on top of your
    bootstrap-key tracking when you have a moment.
- **`src/helpers/getDataFromXml.ts`** (2 regions) — kept your
  `getTimestampFromUnknown`-based timestamp extraction over tf-dev's older
  `extractTimestamp` helper. The auto-merge already preserved
  `data?.attrs?.['photo']`, so the avatar field is intact regardless.
- **`src/hooks/useLogout.tsx`** — kept your `markIntentionalLogout` flow
  over tf-dev's explicit `disconnect({ suppressReconnect: true })` block.
  Your intentional-logout pattern (commit `11ed82a`) is the canonical approach.
- **`src/hooks/useRoomInitialization.tsx`** (2 regions) — kept your tighter
  timeouts (1200ms/3000ms) and `prioritizeRoomPresence + hardCapTimer` flow
  over tf-dev's 5000ms wait + double-presence + double-history-fetch retry.
  - **Worth verifying with a slow-joining migrated room** — tf-dev's 5000ms
    came from `62b0b6d fix(chat): wait longer for migrated room history joins`.
    If the migrated-rooms case regresses, the 1200ms ↔ 5000ms is the knob.
- **`src/networking/xmppClient.ts`** (7 regions) — same theme across most
  conflicts: tf-dev called the suppress-reconnect flag `reconnectSuppressed`
  with logStep tags `:reconnect-suppressed`; you call it `intentionalLogout`
  with `:intentional-no-reconnect`. Took your naming throughout (it's already
  what `useLogout` expects). Conflict #6 is also part of your active-room
  init refactor (took your `timeoutMs: 1200, waitForJoin: false`).
  - **`TODO(merge from tf-dev)`** flagged inline: tf-dev added an
    `endpointKey` field for per-endpoint session tracking (commit `611bd82`).
    You intentionally removed the registry-based reuse in commit `34eaf98` in
    favour of the simpler model. If duplicate-instance issues ever resurface,
    the field declaration has a one-line note pointing back to this.

---

## What needs follow-up after merge

1. **`npm run prepare`** to regenerate `lib/`. I took main's `lib/*` for the
   conflicts (they'd have to be regenerated from src/ anyway), so the current
   `lib/` reflects pre-merge `src/` and needs a build before we cut a release.
2. **Test the migrated-rooms join path** end-to-end (the timeout knob in
   `useRoomInitialization.tsx`).
3. **Optional**: re-introduce the `setProviderBootstrapStatus` enum from
   tf-dev on top of your bootstrap-key tracking in `xmppProvider.tsx` (TODO
   comment in source).

That's it — the merge is otherwise a strict superset of `main`.

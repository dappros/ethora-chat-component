# Changelog

All notable changes to this package are documented here. For cross-SDK release notes, see [ethora/RELEASE-NOTES.md](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

## Unreleased

### Added

- Pushes for reactions: adding an emoji to someone else's message now asks the server for a push to that message's author. `sendMessageReactionStanza` takes `ReactionStanzaData` (`push`, `messageAuthor`, `messageText` cut to 120 characters and left out of encrypted rooms, `photoURL` and the attachment attributes) and puts it on the stanza's `<data>`; nothing is asked for a removed emoji or one's own message. Needs the matching ejabberd `mod_offline_post` and push service.
- Scheduled calls (booking). A "Schedule call" button next to the call buttons in the chat header opens a form (title, local date and time, duration, video or audio, optional description) that books a call through `POST /v1/chats/calls/scheduled`. The backend announces it in the room as `<data type="scheduledCall">` and every member sees one invite card per call: upcoming, open to join (from 15 minutes before the start until the end), ended, or cancelled. An edit or cancel message replaces the card. The card has "Google Calendar", "Outlook" and "Download .ics" links (built by the backend), Join, and Edit and Cancel for the creator and the room owner. Join opens a pre-join panel; no camera or microphone is used until "Join call" is tapped, which goes through the same call path as the header buttons (P2P for 1:1, LiveKit for groups).
- `scheduledCallSlug` prop on `<Chat>` and the `openScheduledCall(slug)` and `parseScheduledCallLink(url)` exports open a scheduled call from a `/call/<slug>` join link: the room is selected and the pre-join panel shown once the user is signed in. `config.scheduledCalls` (`enabled`, default on whenever video calls are on; `onOpenError`; `hosts` and `schemes` to narrow `parseScheduledCallLink`, as in the React Native SDK) controls the feature. Translated in en, fr, es, pt, ht and zh.
- `config.attachments.captionMode` (`'separate'` default, or `'inline'`) selects where the text typed with attachments goes. `'separate'` sends the media message without the caption and then the caption as a normal text message, which is the 26.9.8 wire shape that older readers display. `'inline'` keeps the caption on the media message (`<data caption>`).
- `config.uploads.endpoint` (`'auto'` default, `'legacy'`, `'secure'`) selects the upload route. `'legacy'` posts straight to `/v1/files/` and never calls `/v2/files/secure`; `'secure'` never falls back. `'auto'` keeps the previous secure-then-fallback behaviour.
- `config.features.userBlock` (default `false`) controls the "Block user" item in 1-1 chat menus and the `/v1/chats/blocked` calls behind it. The production backend does not serve that route yet, so the item is hidden unless a host opts in. `disableUserBlock: true` still hides it.
- `config.receipts` (`{ mode, deliveryMaxRoomSize, readMaxRoomSize, maxAgeDays, coalesceMs }`) controls which delivery and read receipts this client sends. Defaults: `mode: 'auto'`, `deliveryMaxRoomSize: 20`, `readMaxRoomSize: 100`, `maxAgeDays: 7`, `coalesceMs: 1500`. `'off'` sends none; received receipts are still displayed.
- Incoming call pushes on web ring like on mobile. The service worker shows a sticky "Incoming call" notification with Answer and Decline actions when no visible page rings the call (new `CALL_PUSH` / `CALL_PUSH_ACK` handshake, so a hidden tab with a dead socket is covered too). Answer opens the app and accepts the call with the push's LiveKit token; Decline tells the caller over XMPP and `POST /v1/chats/call/state/decline/:callId`, and with no page open the worker calls that endpoint with the user token the page mirrors into Cache Storage (deleted on logout).
- A call push has no TTL, so its freshness is read from the `exp` of `callToken`: a stale push shows a "Missed call" notification (tap opens the room) and never rings, and a ring the worker shows is replaced by it at `exp`, or 60 s after the push when `exp` is unreadable or further away (the worker never leaves a sticky ring behind). A call push that arrives before `config.videoCalls` and the user are in Redux is held, not dropped.
- Live chat component config. `config.remoteAppearance: { appId, baseUrl?, initialWaitMs? }` makes the chat read the App's saved look (`GET /v2/chat-component/config`) at start and again whenever the server announces a new version, and apply it to the open chat without reconnecting or resetting anything. Only visual and layout keys are taken from the server (`colorScheme`, `colors.*`, `typography.*`, `backgroundChat.color`, the `disable*` switches, `chatHeaderBurgerMenu`, `chatHeaderSettings.hideSearch`, the AI display options, `secondarySendButton.enabled`), each validated. The first paint waits for the first read, at most 2.5 s by default.
- `config.eventHandlers.onChatComponentConfigUpdated({ appId, version })` is called when the server sends the `chat-component-config-updated` event for the session's own App, once per version. Hosts that fetch the config themselves use it to refetch.
- The `chat-component-config-updated` server event (`urn:ethora:events:1`). It is also accepted from the bare server domain, which is how ejabberd stamps a host-wide announcement; other events still require a user-part sender. A pinned `trustedEventSenders` list must name the domain to hear it.

### Changed

- The chat header's call dialing moved into a shared `placeRoomCall` helper, used by the header buttons and the scheduled-call Join button. Behaviour is unchanged.
- Captions typed with attachments are sent as a separate text message again by default (`attachments.captionMode: 'separate'`). Set `captionMode: 'inline'` to keep the caption on the media message.
- The "Block user" menu item is no longer shown by default. Set `config.features.userBlock: true` once your backend serves `/v1/chats/blocked`.
- Delivery receipts are coalesced per room: the first message is acknowledged at once and a burst or a history replay collapses into one receipt for the newest message. Opening a room with 100 history messages sends at most two receipts instead of up to 100.
- In `auto` mode, delivery receipts are skipped in rooms with more than 20 other members, read markers in rooms with more than 100, and old history is not acknowledged. Ticks in those rooms show "sent" or "delivered" from the other signals that do arrive.
- Read markers are rate limited to one per 3 seconds per room; the final read position is always sent.
- Delivery receipts carry `<no-permanent-store/>` (XEP-0334) so the server does not archive them. Read markers keep `<store/>`.
- A delivery receipt also moves the sender's delivery watermark, so every earlier own message counts as delivered to that member. A read position is also implied by that member posting after the message, and a read position whose message is not loaded is compared by time.
- Seen and delivered lookups for own bubbles use one index per loaded message list, built once and shared by all bubbles, instead of a linear scan per bubble.
- Bubble tails are filled shapes: own bubbles have the tail at the bottom right, others at the bottom left. Only the last bubble of a sender's run has a tail; media-only bubbles and deleted or system rows get none.
- Message time and read ticks are aligned to the text baseline, and the time sits lower in the bubble.
- Media-only bubbles show the time as a glass pill over the picture. One rule (`getMediaTimeLayout`) decides the place for both the time and the bubble; the time moves to the bottom row when a failed notice, quick replies, a URL preview or the translate row is shown.
- The composer grows with soft-wrapped text, with even vertical padding. A single line keeps the 40px field; the field stops at 140px and scrolls beyond that.
- In group rooms with more than 5 other members, the receipt tooltip and ticks show counts: "Read by N of M" and "Delivered to N of M". In smaller groups the tooltip lists names.
- The message list reads only messages, history state and the composing flag from the room, and caches reply wrappers per message. One message update re-renders one bubble instead of every row.
- Bubbles subscribe to their sender's user entry instead of the whole users map, so an unrelated user update no longer re-renders every bubble.
- The chat room, header and thread read narrow room fields, so a change in another room no longer re-renders the open chat.

### Fixed

- A late call push or a late XMPP `call-token` no longer ends a call that was already answered: `setIncomingCallToken` ignores a token while a call is connecting, in progress or being dialled, and a repeat of the ringing call no longer restarts its ring. The incoming ring stops at the `exp` of its token.
- The call notification is closed when its ring ends, from the page and from the service worker; the hidden-tab notification goes through the service worker registration (same tag and actions) and is not shown twice for a push-raised call. A call push without `kind` is an audio call, like the server's default. A page that times a ring out in a hidden tab shows the same "Missed call" notification itself, so it appears whichever of the page and the worker gets there first. A duplicate push for a call the page already has connecting or in progress is acked (no second ring, no false "Missed call"), a push for a different call while busy becomes a plain "Missed call", and a ring the page acked while visible is announced by the page if the user leaves the tab. A Decline the page could not handle (no `<Chat>` on that page) is declined over REST by the worker after 1.5 s. Call taps and Answer open `pushNotifications.clickPath`. A call push without `callId` is keyed by its room on both sides, and one without `callToken` offers Decline only.
- Answer and a tap on a call notification no longer go to one window picked by focus order. The click goes to every window that announced it takes calls and the one that took it acks (`CALL_PUSH_ANSWER_ACK`); with none ready, or none acking within 1.5 s, the worker keeps the click and focuses and navigates an open tab to `pushNotifications.clickPath` (or opens it) instead of closing the notification and losing the call (hidden `/apps` tab with no `<Chat>` focused last, or the only tab). Decline goes to every window too. Pages announce themselves with `CALL_CLIENT_READY` and answer the worker's `CALL_CLIENT_PROBE` after it restarts.
- Several tabs ringing for one call no longer leave a false "Missed call": the tab that answers, declines or sees the caller cancel broadcasts the outcome on a same-origin `BroadcastChannel` (`ethora-call`) and the others end their ring quietly. A Web Lock makes sure only one tab acts on an Answer, tap or Decline.
- A ring a hidden tab shows through the registration no longer stays on screen forever when the tab is closed: the page tells the worker (`CALL_RING_SHOWN`), which swaps it for "Missed call" at the token's `exp` (at most 60 s) like a ring of its own. The worker's expiry timer also no longer gives up when it wakes a millisecond early.
- "Missed call" is no longer shown twice (an alert from the page and another from the worker a few milliseconds apart): the check and the show run under one Web Lock shared by the page and the worker.
- Logout (or an account switch) clears the call push state: a held call push, the tap the worker keeps for the next page load (`ethora-push-pending-v1`) and the call notifications on screen, so the next user never replays the previous one's call.
- Reporting a chat works again. The report modal sent the UI category names (`Spam`, `Child Abuse`, ...), the full room JID and, because of a stale callback, an empty category and text, so `POST /v1/chats/reports/:chatName` rejected every report. It now sends the bare room name, the server's category values (a category the server has no value for, such as Child Abuse, goes as `other` with its name in the text) and a non-empty text, shows a toast for success or failure and closes on success. The mapping lives in `helpers/reportRoom.ts`.
- A call no longer hangs on after the other side drops it. The `call-state` handler read the state, `callId` and `room` from the `<message>` instead of its `<data>`, so the peer's `cancelled` / `declined` / `ended` signal and the server's call log never ended the call; the server's `call-state-declined` is now handled too, and a late signal of an earlier call in the same room no longer ends the current one. Backstops for a lost signal: an incoming call stops ringing after 45 s, and a dial nobody joins in the LiveKit room ends with "No answer" after 45 s (the caller's "Ringing…" used to wait forever); both dial timeouts also send `cancelled` to the callee.
- Reaction pushes in the service worker: shown silent, tagged `<room jid>#reaction` so they replace the chat's previous reaction and not its message notification, and no longer dropped as a repeat of the reacted message's push (same `msgID`). In the foreground a reaction push shows no toast.
- The room list unread badge no longer flickers after a reload. The unread middleware keeps the stored count until a room's history has settled, and the badge is no longer hidden while loading.
- The native broken-image icon is never shown. A picture that fails to load shows a compact unavailable card, and a failed preview or full-size layer marks the picture as unavailable.
- A message body that repeats the file's own URL is no longer shown as a caption.
- Ids such as `send-text-message:<uuid>` no longer read as a timestamp. Only all-digit ids encode a time.
- The read watermark never moves backwards, and reserved viewer names are ignored for receipts.
- Live delivery receipts are ordered by arrival, not by the sender's clock.
- The typing indicator is guarded when the client has no `sendTypingRequestStanza` method, and it uses the current client.
- Removing `typography` from the config of a mounted chat now puts the default font back; the font, size and Google Fonts link it had applied used to stay until a reload.

### Upgrade notes

- In `auto` mode, delivery receipts are no longer sent in rooms with more than `deliveryMaxRoomSize` (20) other members, and read markers are not sent above `readMaxRoomSize` (100). Set `receipts.mode: 'all'` or raise the thresholds to keep the previous behaviour.

## 26.10.1

### Added

- Delivery and read receipts (XEP-0184 / XEP-0333) with tick status on own messages. Hovering a tick shows a tooltip with the state; group rooms list who has read the message. Tooltip strings are translated.
- Multi-attachment messages: up to 10 files per message by default (`config.attachments.maxFiles` overrides it, 10 is the hard cap). Images and videos form an album grid (layouts for 1, 2, 3, 4 and +N files); documents sit below the album as file cards.
- Album files upload in parallel (4 at a time) and are sent as one message with ordered attachments. Each tile shows its own progress, a failed state and a retry; a file that failed after a reload can be removed.
- Caption travels in the media message: `caption` and `captionMentions` on the `<data>` element, sealed inside the envelope in e2ee rooms. One stanza, one bubble. The caption renders under the media and file cards.
- Legacy media messages that carry their text in `body` render as one bubble.
- Full-screen viewer redesign: gallery of images and videos with thumbnails, zoom, keyboard navigation, and an error state with its own unavailable illustration.
- Continuous-scrolling PDF viewer with lazily rendered pages.
- GIFs autoplay (the full file is loaded) and carry a GIF chip.
- Media last-message preview in the room list: thumbnail when available, otherwise a type label.
- Message reactions redesigned: chips straddle the bubble edge, with a tooltip listing reactors and a +N overflow.
- Bot quick-reply buttons restyled.
- Composer focus moves to the message input on chat switch (desktop only).
- `config.colors.ownMessageBackground` / `otherMessageBackground` / `inputBackground`: background colours for own/other message bubbles and the message input bar (were hardcoded `#E7EDF9` / `#FFFFFF` / `#fff`).
- i18n additions for en, fr, es, pt, ht and zh (receipts, attachments, viewer, unavailable states).

### Changed

- Bubble layout: bubble radius 18px. Media bubbles use a 6px inset with 12px concentric media corners; text bubbles use 8px 12px. Equal insets on all bubble types.
- Time sits at the bottom right of every bubble. Short text shares its line with the time, for own and other messages alike. Media-only bubbles show the time as a glass pill bottom-right.
- Bubble tails added to message bubbles.
- Album and solo media fill the bubble width responsively (`--ethora-media-w`). Albums show images and videos above documents.
- Captions use 8px 10px 4px padding. File cards use a 40px icon tile and a 32px download button, show the name and size (no page count).
- SVG is treated as a plain file, never rendered as an image.
- File names that the backend returns as UTF-8 read as Latin-1 (mojibake) are repaired for display.
- Room list uses a two-line room card with a fixed 76px height.
- Avatars show initials first, then the photo, using a shared avatar URL cache.
- Loading states: soft left-to-right shimmer, blur-up for images, upload progress ring, and an own SVG for unavailable images.
- A failed image load no longer removes the message (HEAD probe removed). Previews load first, and token recovery runs once per token.
- Line above the message composer removed.
- Up to 10 attachments per message by default (was 5).
- UI strings no longer use em dashes. Removed unused i18n keys: `attachment.pages`, `modal.filePreview.previousPage`, `modal.filePreview.nextPage`.

### Fixed

- Message reactions persist across reloads. They were missing from rooms restored from cache.
- OS notifications show the sender name and message text instead of raw ids.
- A message that failed to send no longer shows a delivery tick.
- Retry for a failed file is reachable from the +N cell. After a reload, a failed file offers Remove instead of a dead Retry.
- Media falls back to a direct download when fetch is blocked by CORS.
- The viewer never shows `??` for an unknown sender.
- File card download icon follows the text colour in the dark scheme.
- The XMPP stream is opened to the configured `xmppSettings.host` (`VITE_XMPP_HOST` in the web app) and that domain is passed to the XMPP client. It used to be overwritten with the host of the WebSocket URL (and left empty for `ws://` URLs), so an install whose WebSocket endpoint is not on the XMPP domain was refused with `host-unknown`. Without a configured host the WebSocket URL's host is still used, now for `ws://` as well as `wss://`.
- `xmppSettings.conference` is no longer overwritten with `conference.<xmpp host>` on the XMPP client. Rooms created from an API refresh were built on that derived name, so an install whose MUC service is not called `conference.<xmpp domain>` got room JIDs on a service that does not exist. The derived name is still used when no `conference` is configured.
- `config.fallbackScreens.noUser` is now honored on **logout** too: `LoginWrapper` (which renders on logout, before `ChatWrapper` mounts) previously always showed the built-in Ethora login form, ignoring the fallback.
- `config.backgroundChat.color` / `.image` is now applied to the chat (messages area) background. It was type-only and did nothing.
- `config.colors.icons` now also drives the active send button, the new-chat button and other accent icon-buttons (not just the standalone chrome icons). It defaults to `colors.primary`, so setting `icons` equal to `primary` produces no visible change; set a distinct colour to decouple them.
- Unread counter no longer ramps up from `0`: `useUnread().loading` now stays `true` while a room is still backfilling history, so the host can reveal the final count at once. The room-list badge is likewise hidden until the room's history settles.

### Upgrade notes

- `sendMedia` (and the hooks that wrap it: `CustomInputComponent` / `onSendMedia`, or a custom `useSendMessage`) receives a third argument `caption?: { text: string; mentions?: IMentionSpan[] }`. Hosts that override it receive the caption here. With the default `captionMode: 'separate'` send it as a separate text message after the media; with `captionMode: 'inline'` send it with the media. `sendMessageMedia(data, type, roomJID, isReply, isChecked, mainMessage, caption)` takes it as the 7th argument.
- Viewer i18n keys renamed: `modal.filePreview.previousImage` is now `previousItem`, `nextImage` is now `nextItem`, and `showImage` is now `showItem`. Update any host overrides.
- Room caches saved by earlier versions are refetched once: the room shell stays and the transcript is reloaded from history, so reactions are populated.

## 26.5.1

### Added

- `config.typography.fontSize`: base font size (px) for the chat UI, published as `--ethora-font-size` (+ `-xs`/`-sm`/`-lg` variants); message text, sender names, timestamps, inputs, room names and badges scale proportionally.
- `config.colors.icons`: default colour for the chat's chrome icons (input bar: attach/mic/send/file, header: back/more/search/edit/info/close/download, empty-state, etc.), published as the `--ethora-icon-color` CSS variable. Defaults to `colors.primary`. Semantic icons (destructive red, status ticks, Google brand) intentionally keep their own colours.

### Fixed

- The configured font family now applies to **message text and sender names**: when only `typography.googleFontsFamily` is provided (without `fontFamily`), the family is now also published to `--ethora-font-family` instead of merely being loaded.
- Message sender name colour now follows `colors.primary` for all senders (previously non-own messages were hardcoded to `#0052cd`).
- Attach (file) and microphone icons in the input bar now accept a colour and follow `colors.icons`/`colors.primary` (were hardcoded to `#0052CD`).
- Empty-state illustrations now follow the theme colour: "Start a Conversation" and the "This chat is empty" illustration (the latter replaced its legacy raster PNG with a vector whose accent uses `currentColor`). `config.noMessagesPlaceholder` still lets you swap in your own.

### Added

- `useUnread` now returns a `loading` flag (alias `isLoading`, matching the React Native SDK) that stays `true` until the room list has been populated at least once, so hosts can show a spinner instead of a misleading `0`.
- `config.fallbackScreens` (`noUser` / `noConnection` / `noRoom`): replace the built-in Ethora login form, the "Connecting..." state and the empty-rooms state with custom text or React nodes.
- `config.hiddenRooms` (`titles` / `jids`): hide specific rooms (e.g. the auto-created "Main chat") from the room list and from unread counters.

### Fixed

- Per-room unread badges in the room list now appear for rooms the user has never opened: rooms without a read marker get an unread baseline when they first enter the store, so new incoming messages are counted (previously the count was stuck at 0).
- The room-list unread badge now shows `10+` (instead of a bare `10`) when the count is capped by incomplete history, matching `useUnread`'s display values.

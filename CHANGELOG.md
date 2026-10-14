# Changelog

All notable changes to this package are documented here. For cross-SDK release notes, see [ethora/RELEASE-NOTES.md](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

## 26.10.0

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
- `@mention` autocomplete, highlighting, and clickable mentions that open the profile.
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

- `sendMedia` (and the hooks that wrap it: `CustomInputComponent` / `onSendMedia`, or a custom `useSendMessage`) receives a third argument `caption?: { text: string; mentions?: IMentionSpan[] }`. Hosts that override it must send the caption with the media instead of sending a second text message. `sendMessageMedia(data, type, roomJID, isReply, isChecked, mainMessage, caption)` takes it as the 7th argument.
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

# Changelog

All notable changes to this package are documented here. For cross-SDK release notes, see [ethora/RELEASE-NOTES.md](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

## Unreleased

### Added

- `config.colors.ownMessageBackground` / `otherMessageBackground` / `inputBackground`: background colours for own/other message bubbles and the message input bar (were hardcoded `#E7EDF9` / `#FFFFFF` / `#fff`).

### Fixed

- `config.fallbackScreens.noUser` is now honored on **logout** too: `LoginWrapper` (which renders on logout, before `ChatWrapper` mounts) previously always showed the built-in Ethora login form, ignoring the fallback.
- `config.backgroundChat.color` / `.image` is now actually applied to the chat (messages area) background — previously the prop was type-only and did nothing.
- `config.colors.icons` now also drives the active send button, the new-chat button and other accent icon-buttons (not just the standalone chrome icons). It defaults to `colors.primary`, so setting `icons` equal to `primary` produces no visible change — set a distinct colour to decouple them.
- Unread counter no longer ramps up from `0`: `useUnread().loading` now stays `true` while a room is still backfilling history, so the host can reveal the final count at once. The room-list badge is likewise hidden until the room's history settles.

## 26.5.1

### Added

- `config.typography.fontSize`: base font size (px) for the chat UI, published as `--ethora-font-size` (+ `-xs`/`-sm`/`-lg` variants); message text, sender names, timestamps, inputs, room names and badges scale proportionally.
- `config.colors.icons`: default colour for the chat's chrome icons (input bar — attach/mic/send/file, header — back/more/search/edit/info/close/download, empty-state, etc.), published as the `--ethora-icon-color` CSS variable. Defaults to `colors.primary`. Semantic icons (destructive red, status ticks, Google brand) intentionally keep their own colours.

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

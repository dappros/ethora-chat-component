# Changelog

All notable changes to this package are documented here. For cross-SDK release notes, see [ethora/RELEASE-NOTES.md](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

## 26.5.1

### Added

- `useUnread` now returns a `loading` flag (alias `isLoading`, matching the React Native SDK) that stays `true` until the room list has been populated at least once, so hosts can show a spinner instead of a misleading `0`.
- `config.fallbackScreens` (`noUser` / `noConnection` / `noRoom`): replace the built-in Ethora login form, the "Connecting..." state and the empty-rooms state with custom text or React nodes.
- `config.hiddenRooms` (`titles` / `jids`): hide specific rooms (e.g. the auto-created "Main chat") from the room list and from unread counters.

### Fixed

- Per-room unread badges in the room list now appear for rooms the user has never opened: rooms without a read marker get an unread baseline when they first enter the store, so new incoming messages are counted (previously the count was stuck at 0).
- The room-list unread badge now shows `10+` (instead of a bare `10`) when the count is capped by incomplete history, matching `useUnread`'s display values.

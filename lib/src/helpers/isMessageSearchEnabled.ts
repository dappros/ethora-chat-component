import type { IConfig } from '../types/types';

/**
 * The single rule for message search. It is opt-in: the host must set
 * `enableMessageSearch` AND provide an `appId` (the archive endpoint is scoped
 * by app). A leftover `disableMessageSearch: true` still wins as a hard off.
 * Every entry point (header button, profile entry, chat-list matches, the
 * Ctrl/Cmd+F shortcut, the modal itself) goes through this helper.
 */
export const isMessageSearchEnabled = (
  config?: Pick<
    IConfig,
    'enableMessageSearch' | 'disableMessageSearch' | 'appId'
  > | null
): boolean =>
  Boolean(config?.enableMessageSearch) &&
  !config?.disableMessageSearch &&
  Boolean(config?.appId);

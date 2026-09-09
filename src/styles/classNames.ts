/**
 * Global CSS class names owned by this SDK.
 *
 * This package is embedded into host applications, so every class name it
 * writes into the DOM shares a namespace with the host's own stylesheet.
 * Anything declared in `src/index.css` must therefore be prefixed with
 * `ethora-` (so it cannot collide with a host class of the same name) and,
 * where possible, nested under {@link CHAT_ROOT_CLASS} (so it cannot leak
 * styling onto host markup).
 *
 * Keep these constants as the single source of truth: `index.css` and every
 * component that adds/removes one of these classes must agree, and a plain
 * string literal in a `classList.add(...)` call is easy to drift.
 */

/**
 * Marks a subtree as "owned by the chat".
 *
 * Applied to:
 *  - the invisible (`display: contents`) wrapper `<Chat>` renders around its
 *    whole tree, so every chat node is a descendant, and
 *  - UI the SDK renders OUTSIDE that tree (the in-app notification container,
 *    the portalled language modal), which would otherwise lose the chat's
 *    scrollbar/typography defaults.
 *
 * Everything in `index.css` that is not itself `ethora-`-prefixed (scrollbars,
 * base font) is scoped to this class, which is what keeps the host page's own
 * scrollbars and body typography untouched.
 */
export const CHAT_ROOT_CLASS = 'ethora-chat-root';

/** Transient highlight flashed on a message when a notification is opened. */
export const MESSAGE_HIGHLIGHT_CLASS = 'ethora-message-highlight';

/** Fixed-position container holding the in-app notification toasts. */
export const NOTIFICATION_CONTAINER_CLASS =
  'ethora-message-notification-container';

/** Forces the colour-emoji font on nodes that render a bare emoji glyph. */
export const APPLE_EMOJI_CLASS = 'ethora-apple-emoji';

/**
 * Stable `data-testid` values exposed by `@ethora/chat-component`'s
 * UI components.
 *
 * Cross-platform parity: string values match Android's `*TestTags`
 * Kotlin objects (in `chat-ui/src/main/.../components/*Kt`) and iOS's
 * `*AccessibilityID` Swift enums (in `XMPPChatUI/AccessibilityIdentifiers.swift`),
 * so a single Maestro YAML flow exercises the same intent on either
 * mobile platform — and Playwright tests in host apps using this
 * component (e.g. `ethora-app-reactjs`) can resolve the same nodes
 * via `data-testid`.
 *
 * Do not change a value here without updating both mobile consumers.
 */

export const ChatInputTestIds = {
  inputField: 'chat_input',
  sendButton: 'chat_send_button',
  attachButton: 'chat_attach_button',
} as const;

export const MessageBubbleTestIds = {
  mediaContent: 'chat_message_image',
} as const;

export const RoomListTestIds = {
  roomsList: 'rooms_list',
  roomRow: 'room_row',
  searchInput: 'rooms_search_input',
  createRoomButton: 'create_room_button',
} as const;

export const AuthTestIds = {
  emailInput: 'auth_email_input',
  passwordInput: 'auth_password_input',
  submitButton: 'auth_submit_button',
  loginErrorMessage: 'auth_login_error',
} as const;

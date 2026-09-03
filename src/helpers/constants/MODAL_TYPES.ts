// MODAL_TYPES is imported by many modal components themselves (e.g.
// ChatProfileModal reads MODAL_TYPES.CHAT_PROFILE) as well as by anything
// that opens a modal (RoomList, ChatHeader, Message, ...). This file used to
// ALSO import every one of those modal components (to build MODAL_COMPONENTS
// below), which created an import cycle: MODAL_TYPES -> ChatProfileModal ->
// MODAL_TYPES. Under Vite's module evaluation order that cycle surfaced as
// "Cannot access 'ChatProfileModal' before initialization" during HMR.
//
// The fix is this split: MODAL_TYPES stays here with zero component
// imports, and the id -> component lookup table lives in
// ./modalComponents.ts (which is free to import the modal components,
// since none of them import IT back). Import MODAL_COMPONENTS from there.
export const MODAL_TYPES = {
  SETTINGS: 'settings',
  PROFILE: 'profile',
  CHAT_PROFILE: 'chatprofile',
  MANAGE_DATA: 'managedata',
  VISIBILITY: 'visibility',

  PROFILE_SHARES: 'profile_shares',
  DOCUMENT_SHARES: 'document_shares',
  BLOCKED_USERS: 'blocked_users',

  REFERRALS: 'referrals',

  FILE_PREVIEW: 'file_preview',

  // SETTINGS: 'Settings',
  // PROFILE: 'Profile',
  // CHAT_PROFILE: 'Chat Profile',

  // MANAGE_DATA: 'Manage Data',
  // VISIBILITY: 'Visiblility',
  // PROFILE_SHARES: 'Profile Shares',
  // DOCUMENT_SHARES: 'Document Shares',
  // BLOCKED_USERS: 'Blocked Users',
  // REFERRALS: 'Referrals',
};

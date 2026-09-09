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

  FILE_PREVIEW: 'file_preview',
};

/**
 * Panels reached from inside Settings. Their back button (and Escape) steps
 * back to the Settings list rather than closing the drawer outright.
 */
export const SETTINGS_SUB_MODAL_TYPES: string[] = [
  MODAL_TYPES.MANAGE_DATA,
  MODAL_TYPES.VISIBILITY,
];

/**
 * Panels that open as a right-hand side drawer instead of a centred card:
 * the profile/settings family. Everything else (file preview) keeps the
 * centred-dialog presentation.
 */
export const DRAWER_MODAL_TYPES: string[] = [
  MODAL_TYPES.SETTINGS,
  MODAL_TYPES.PROFILE,
  MODAL_TYPES.CHAT_PROFILE,
  ...SETTINGS_SUB_MODAL_TYPES,
];

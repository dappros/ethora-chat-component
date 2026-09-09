import { lazy } from 'react';
import type React from 'react';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';

// Split out of helpers/constants/MODAL_TYPES.ts to break an import cycle:
// several of these modal components import MODAL_TYPES themselves, so
// having MODAL_TYPES.ts also import all of them (to build this lookup
// table) created a cycle that threw "Cannot access '<Modal>' before
// initialization" under Vite HMR. This module is one-way: it imports the
// modal components and MODAL_TYPES, and nothing imports this module back
// from inside a modal component.
//
// Every entry is loaded lazily: none of these modals is referenced
// anywhere except through this table, and together they were the largest
// first-party slice of the main chunk while being needed only after an
// explicit user action. Modal.tsx wraps the rendered entry in Suspense.
type ModalComponent = React.FC<{ handleCloseModal: () => void }>;

export const MODAL_COMPONENTS: Record<
  string,
  React.LazyExoticComponent<ModalComponent>
> = {
  [MODAL_TYPES.SETTINGS]: lazy(
    () => import('./UserSettingsModal/UserSettingsModal')
  ),
  [MODAL_TYPES.PROFILE]: lazy(
    () => import('./UserProfileModal/UserProfileModal')
  ),
  [MODAL_TYPES.CHAT_PROFILE]: lazy(
    () => import('./ChatProfileModal/ChatProfileModal')
  ),
  [MODAL_TYPES.MANAGE_DATA]: lazy(
    () => import('./SettingsModals/ManageDataModal/ManageDataModal')
  ),
  [MODAL_TYPES.VISIBILITY]: lazy(
    () => import('./SettingsModals/Visibility/VisibilityModal')
  ),
  [MODAL_TYPES.FILE_PREVIEW]: lazy(
    () => import('./FilePreviewModal/FilePreviewModal')
  ),
};

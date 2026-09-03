import ChatProfileModal from './ChatProfileModal/ChatProfileModal';
import FilePreviewModal from './FilePreviewModal/FilePreviewModal';
import BlockedUsersModal from './SettingsModals/BlockedUsers/BlockedUsersModal';
import DocumentSharesModal from './SettingsModals/DocumentShares/DocumentSharesModal';
import ManageDataModal from './SettingsModals/ManageDataModal/ManageDataModal';
import ProfileSharesModal from './SettingsModals/ProfileShares/ProfileShares';
import ReferralsModal from './SettingsModals/Referrals/Referrals';
import VisibilityModal from './SettingsModals/Visibility/VisibilityModal';
import UserProfileModal from './UserProfileModal/UserProfileModal';
import UserSettingsModal from './UserSettingsModal/UserSettingsModal';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';

// Split out of helpers/constants/MODAL_TYPES.ts to break an import cycle:
// several of these modal components import MODAL_TYPES themselves, so
// having MODAL_TYPES.ts also import all of them (to build this lookup
// table) created a cycle that threw "Cannot access '<Modal>' before
// initialization" under Vite HMR. This module is one-way: it imports the
// modal components and MODAL_TYPES, and nothing imports this module back
// from inside a modal component.
export const MODAL_COMPONENTS: Record<
  string,
  React.FC<{ handleCloseModal: () => void }>
> = {
  [MODAL_TYPES.SETTINGS]: UserSettingsModal,
  [MODAL_TYPES.PROFILE]: UserProfileModal,
  [MODAL_TYPES.CHAT_PROFILE]: ChatProfileModal,
  [MODAL_TYPES.MANAGE_DATA]: ManageDataModal,
  [MODAL_TYPES.VISIBILITY]: VisibilityModal,
  [MODAL_TYPES.REFERRALS]: ReferralsModal,
  [MODAL_TYPES.DOCUMENT_SHARES]: DocumentSharesModal,
  [MODAL_TYPES.PROFILE_SHARES]: ProfileSharesModal,
  [MODAL_TYPES.BLOCKED_USERS]: BlockedUsersModal,
  [MODAL_TYPES.FILE_PREVIEW]: FilePreviewModal,
};

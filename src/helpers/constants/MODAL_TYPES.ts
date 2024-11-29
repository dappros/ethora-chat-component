import ChatProfileModal from '../../components/Modals/ChatProfileModal/ChatProfileModal';
import FilePreviewModal from '../../components/Modals/FilePreviewModal/FilePreviewModal';
import BlockedUsersModal from '../../components/Modals/SettingsModals/BlockedUsers/BlockedUsersModal';
import DocumentSharesModal from '../../components/Modals/SettingsModals/DocumentShares/DocumentSharesModal';
import ManageDataModal from '../../components/Modals/SettingsModals/ManageDataModal/ManageDataModal';
import ProfileSharesModal from '../../components/Modals/SettingsModals/ProfileShares/ProfileShares';
import ReferralsModal from '../../components/Modals/SettingsModals/Referrals/Referrals';
import VisibilityModal from '../../components/Modals/SettingsModals/Visibility/VisibilityModal';
import UserProfileModal from '../../components/Modals/UserProfileModal/UserProfileModal';
import UserSettingsModal from '../../components/Modals/UserSettingsModal/UserSettingsModal';

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

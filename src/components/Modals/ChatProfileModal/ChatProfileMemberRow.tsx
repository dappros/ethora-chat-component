import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { RoomMember } from '../../../types/types';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import { Label, LabelData, Divider, ModalListRow } from '../styledModalComponents';
import DropdownMenu from '../../DropdownMenu/DropdownMenu';
import Button from '../../styled/Button';
import { ethoraLogger } from '../../../helpers/ethoraLogger';

interface ChatProfileMemberRowProps {
  member: RoomMember;
  isLast: boolean;
  disableClick: boolean;
  online: boolean;
  showMenu: boolean;
  menuOptions: { label: string; icon: any; onClick: (e?: any) => void }[];
  moreOptionsLabel: string;
  onAvatarClick: (user: RoomMember) => void;
}

// Extracted from ChatProfileModal so each row can subscribe to ONLY its own
// entry in the app-wide `usersSet` dictionary instead of the modal reading
// the whole map. XMPP affiliation responses populate `activeRoom.members`
// with bare xmppUsername-only entries (firstName/lastName/profileImage are
// blank); `usersSet` carries the real names/avatars from <data> stamps and
// API enrichment. Doing the merge HERE, per-row, means an insertUsers
// dispatch for some other user in the app (or even another member of this
// same room) only re-renders that one user's row, not the whole
// (potentially ~3,500-row) member list - see ChatRoomItem.tsx / Message.tsx
// for the same narrowed-selector pattern used elsewhere in this codebase.
const ChatProfileMemberRow: React.FC<ChatProfileMemberRowProps> = ({
  member,
  isLast,
  disableClick,
  online,
  showMenu,
  menuOptions,
  moreOptionsLabel,
  onAvatarClick,
}) => {
  const key = String(member?.xmppUsername || '');
  const localKey = key.split('@')[0];
  const enrichedEntry = useSelector(
    (state: RootState) =>
      (state.rooms.usersSet as any)?.[key] ?? (state.rooms.usersSet as any)?.[localKey]
  );

  const firstName = member.firstName || enrichedEntry?.firstName || '';
  const lastName = member.lastName || enrichedEntry?.lastName || '';
  const profileImage =
    (member as any).profileImage ||
    enrichedEntry?.profileImage ||
    enrichedEntry?.photoURL ||
    '';

  const enriched: RoomMember = {
    ...member,
    firstName,
    lastName,
    profileImage,
  } as RoomMember;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'start',
        boxSizing: 'border-box',
      }}
    >
      <ModalListRow
        style={{
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '8px',
            cursor: disableClick ? 'default' : 'pointer',
          }}
          onClick={disableClick ? undefined : () => onAvatarClick(enriched)}
        >
          <ProfileImagePlaceholder
            name={`${firstName} ${lastName}`}
            icon={profileImage}
            size={40}
            online={online}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              alignItems: 'start',
              justifyContent: 'center',
            }}
          >
            <Label style={{ fontSize: '16px', fontWeight: 600 }}>
              {firstName} {lastName}
            </Label>
            {member.last_active && (
              <LabelData>
                {new Date(member.last_active * 1000).toLocaleString()}
              </LabelData>
            )}
          </div>
        </div>
        {member.role && member.role !== 'none' && (
          <div
            style={{
              backgroundColor:
                member.ban_status !== 'banned'
                  ? 'var(--ethora-color-primary-soft, #E7EDF9)'
                  : 'rgba(217, 45, 32, 0.1)',
              color:
                member.ban_status !== 'banned'
                  ? 'var(--ethora-color-primary, #0052CD)'
                  : 'var(--ethora-color-danger, #D92D20)',
              padding: '5px 8px',
              borderRadius: 'var(--ethora-radius-lg, 16px)',
              fontSize: '12px',
            }}
          >
            {member.role}
          </div>
        )}
        {showMenu && (
          <DropdownMenu
            options={menuOptions}
            openButton={
              <Button
                onClick={(e) => {
                  e.preventDefault();
                }}
              >
                {moreOptionsLabel}
              </Button>
            }
            onClose={() => ethoraLogger.log('Dropdown closed')}
          />
        )}
      </ModalListRow>
      {!isLast && <Divider />}
    </div>
  );
};

export default React.memo(ChatProfileMemberRow);

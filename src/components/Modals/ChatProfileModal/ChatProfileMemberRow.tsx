import React from 'react';
import styled from 'styled-components';
import { useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { RoomMember } from '../../../types/types';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import DropdownMenu from '../../DropdownMenu/DropdownMenu';
import Button from '../../styled/Button';
import { ethoraLogger } from '../../../helpers/ethoraLogger';
import { useT, useUiLocale } from '../../../i18n/useT';

// Row height/radius/hover match RoomList's ChatItem and the Files tab's own
// rows (see src/components/styled/RoomListComponents/index.tsx and
// src/components/Files/FilesList.tsx's `Row`) - the same list surface
// language used everywhere else in this SDK, so a member row reads as part
// of the same family instead of a plainer, unstyled stack.
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: var(--ethora-space-3, 12px);
  min-height: 60px;
  border-radius: var(--ethora-radius-md, 12px);
  padding: var(--ethora-space-2, 8px);
  transition: background-color var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, ease);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Identity = styled.div<{ $clickable?: boolean }>`
  display: flex;
  align-items: center;
  gap: var(--ethora-space-3, 12px);
  min-width: 0;
  flex: 1 1 auto;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
    border-radius: var(--ethora-radius-sm, 8px);
  }
`;

const NameColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const Name = styled.span`
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: var(--ethora-font-weight-semibold, 600);
  color: var(--ethora-color-text, #141414);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// The secondary line every row was missing: "online" (live presence) takes
// priority over a stale last-seen timestamp, which in turn takes priority
// over the member's role - each row shows whichever of these is most useful,
// but always shows something, so a big member list has rhythm instead of
// every row looking identical.
const Secondary = styled.span<{ $online?: boolean }>`
  font-size: var(--ethora-font-size-xs, 12px);
  color: ${({ $online }) =>
    $online
      ? 'var(--ethora-color-online, #12b76a)'
      : 'var(--ethora-color-text-muted, #8c8c8c)'};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RoleTag = styled.span<{ $banned?: boolean }>`
  flex: 0 0 auto;
  background-color: ${({ $banned }) =>
    $banned ? 'rgba(217, 45, 32, 0.1)' : 'var(--ethora-color-primary-soft, #e7edf9)'};
  color: ${({ $banned }) =>
    $banned
      ? 'var(--ethora-color-danger, #d92d20)'
      : 'var(--ethora-color-primary, #0052cd)'};
  padding: var(--ethora-space-1, 4px) var(--ethora-space-2, 8px);
  border-radius: var(--ethora-radius-full, 999px);
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: var(--ethora-font-weight-medium, 500);
  text-transform: capitalize;
  [data-ethora-color-scheme='dark'] & {
    ${({ $banned }) =>
      $banned ? 'background-color: rgba(242, 118, 107, 0.15);' : ''}
  }
`;

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
  disableClick,
  online,
  showMenu,
  menuOptions,
  moreOptionsLabel,
  onAvatarClick,
}) => {
  const t = useT();
  const locale = useUiLocale();
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

  const hasRole = !!member.role && member.role !== 'none';
  const isBanned = member.ban_status === 'banned';

  let secondaryText = '';
  if (online) {
    secondaryText = t('presence.online');
  } else if (member.last_active) {
    try {
      secondaryText = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
      }).format(new Date(member.last_active * 1000));
    } catch {
      secondaryText = '';
    }
  } else if (hasRole) {
    secondaryText = member.role as string;
  }

  return (
    <Row>
      <Identity
        $clickable={!disableClick}
        role={disableClick ? undefined : 'button'}
        tabIndex={disableClick ? undefined : 0}
        onClick={disableClick ? undefined : () => onAvatarClick(enriched)}
        onKeyDown={
          disableClick
            ? undefined
            : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAvatarClick(enriched);
                }
              }
        }
      >
        <ProfileImagePlaceholder
          name={`${firstName} ${lastName}`}
          icon={profileImage}
          size={40}
          online={online}
        />
        <NameColumn>
          <Name>
            {firstName} {lastName}
          </Name>
          {secondaryText && (
            <Secondary $online={online}>{secondaryText}</Secondary>
          )}
        </NameColumn>
      </Identity>
      {hasRole && <RoleTag $banned={isBanned}>{member.role}</RoleTag>}
      {showMenu && (
        <DropdownMenu
          options={menuOptions}
          openButton={
            <Button
              onClick={(e) => {
                e.preventDefault();
              }}
              aria-label={moreOptionsLabel}
            >
              {moreOptionsLabel}
            </Button>
          }
          onClose={() => ethoraLogger.log('Dropdown closed')}
        />
      )}
    </Row>
  );
};

export default React.memo(ChatProfileMemberRow);

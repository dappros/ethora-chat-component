import React, {
  Dispatch,
  SetStateAction,
  useState,
  useMemo,
  useEffect,
} from 'react';
import { ModalTitle, ModalSectionLabel } from '../Modals/styledModalComponents';
import {
  ScrollableContainer,
  UserItem,
  UserItemInfo,
  Checkbox,
  Label,
  EmptyState,
} from './StyledComponents';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { RoomMember } from '../../types/types';
import { debounce } from '../../helpers/debounce';
import { StyledInput } from '../styled/StyledInputComponents/StyledInputComponents';
import { useUsersSet } from '../../hooks/useRoomState';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT } from '../../i18n/useT';
import { ProfileImagePlaceholder } from '../MainComponents/ProfileImagePlaceholder';

// Windowed rendering, same idea (and same constants) as ChatProfileModal's
// member list: a room's user directory can run to ~3,500 entries, and
// mounting every row (avatar + name + checkbox) unconditionally - as this
// list used to - is what made the New Chat modal's "Private" picker lag.
// Only the first USERS_RENDER_WINDOW_INITIAL rows are mounted; "Show more"
// grows the window by USERS_RENDER_WINDOW_STEP at a time.
const USERS_RENDER_WINDOW_INITIAL = 150;
const USERS_RENDER_WINDOW_STEP = 150;

interface UsersListProps {
  selectedUsers: RoomMember[];
  setSelectedUsers: Dispatch<SetStateAction<RoomMember[]>>;
  headerElement?: boolean;
  style?: any;
  filter?: RoomMember[];
}

const UsersList: React.FC<UsersListProps> = ({
  style,
  selectedUsers,
  setSelectedUsers,
  headerElement,
  filter,
}) => {
  const usersSet = useUsersSet();
  const { config } = useChatSettingState();
  const t = useT();
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<RoomMember[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(
    USERS_RENDER_WINDOW_INITIAL
  );

  const handleUserSelect = (user: RoomMember) => {
    setSelectedUsers((prev) => {
      const isSelected = prev.some((u) => u._id === user._id);
      // Enforce the "max 20" cap shown in the copy below: without this
      // guard the row's disabled checkbox was purely cosmetic - the click
      // handler lives on the whole row, not the (disabled) checkbox, so a
      // click still added a 21st+ user before this fix.
      if (!isSelected && prev.length >= 20) return prev;
      return isSelected
        ? prev.filter((u) => u._id !== user._id)
        : [...prev, user];
    });
  };

  const debouncedFilter = useMemo(
    () =>
      debounce((term: string) => {
        const lower = term.toLowerCase();
        const users = (Object.values(usersSet) as RoomMember[]).filter(
          (user: RoomMember) =>
            `${user.firstName} ${user.lastName}`.toLowerCase().includes(lower)
        );
        setFilteredUsers(users);
      }, 100),
    [usersSet]
  );

  useEffect(() => {
    debouncedFilter(searchTerm);
    // A new query changes which/how-many users match, so the old window
    // position no longer means anything - start from the top of the (new)
    // filtered list, same as ChatProfileModal resets its member window on
    // a fresh search. Reset immediately (not debounced) so the window
    // doesn't briefly show stale rows from the previous query's tail.
    setVisibleCount(USERS_RENDER_WINDOW_INITIAL);
  }, [searchTerm, debouncedFilter]);

  useEffect(() => {
    setFilteredUsers(Object.values(usersSet) as RoomMember[]);
  }, [usersSet]);

  const visibleUsers = useMemo(
    () => filteredUsers.slice(0, visibleCount),
    [filteredUsers, visibleCount]
  );
  const hasMoreUsers = visibleCount < filteredUsers.length;

  // `style` (maxHeight, width, ...) is meant for the scrollable rows list
  // below - applying it here too (as this wrapper used to) let its maxHeight
  // and no-overflow combination clip this whole block shorter than its real
  // content (label + search + list), so the list's last rows visually spilled
  // out past this box and collided with whatever the caller renders next
  // (e.g. NewChatModal's "Back to creation" button). Only pass through the
  // width so the wrapper still matches the caller's intended footprint.
  const { width, minWidth } = (style || {}) as React.CSSProperties;

  return (
    <div style={{ width, minWidth }}>
      {headerElement ? (
        <ModalTitle>{t('modal.selectUsers.title')}</ModalTitle>
      ) : (
        <ModalSectionLabel>{t('modal.selectUsers.title')}</ModalSectionLabel>
      )}

      <StyledInput
        $colorBg={config?.colors?.colorInput}
        type="text"
        placeholder={t('modal.selectUsers.searchPlaceholder')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ width: '100%', marginTop: 8 }}
      />

      <ScrollableContainer style={{ ...style }}>
        {filteredUsers.length === 0 ? (
          <EmptyState>{t('modal.selectUsers.empty')}</EmptyState>
        ) : (
          <>
            {visibleUsers.map((user) => {
              const isSelected = selectedUsers.some((u) => u._id === user._id);
              const fullName = `${user.firstName} ${user.lastName}`.trim();
              return (
                <UserItem
                  key={user._id}
                  onClick={() => handleUserSelect(user)}
                  $selected={isSelected}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleUserSelect(user);
                    }
                  }}
                >
                  <ProfileImagePlaceholder
                    name={fullName}
                    icon={(user as any).profileImage || (user as any).photoURL}
                    size={36}
                  />
                  <UserItemInfo>
                    <Label>{fullName || user.xmppUsername}</Label>
                  </UserItemInfo>
                  <Checkbox
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    aria-label={fullName || user.xmppUsername}
                    disabled={!isSelected && selectedUsers.length >= 20}
                  />
                </UserItem>
              );
            })}
            {hasMoreUsers && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '12px 0',
                  cursor: 'pointer',
                }}
                onClick={() =>
                  setVisibleCount((count) => count + USERS_RENDER_WINDOW_STEP)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setVisibleCount(
                      (count) => count + USERS_RENDER_WINDOW_STEP
                    );
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <Label
                  style={{
                    color: 'var(--ethora-color-primary, #0052CD)',
                    fontSize: '13px',
                  }}
                >
                  {t('modal.chatProfile.membersShowMore', {
                    count: filteredUsers.length - visibleCount,
                  })}
                </Label>
              </div>
            )}
          </>
        )}
      </ScrollableContainer>
    </div>
  );
};

export default UsersList;

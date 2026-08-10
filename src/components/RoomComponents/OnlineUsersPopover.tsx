import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { RoomMember } from '../../types/types';
import { isSameXmppUsername } from '../../helpers/xmppUsername';
import { useT } from '../../i18n/useT';

interface OnlineUsersPopoverProps {
  /** xmppUsernames currently online in this room (from useRoomPresence). */
  onlineUsernames: string[];
  members?: RoomMember[];
  myXmppUsername: string;
  isChatActive?: boolean;
}

const resolveDisplayName = (
  enriched: Partial<RoomMember> | undefined,
  fallback: string
): string => {
  const fullName = `${enriched?.firstName || ''} ${enriched?.lastName || ''}`.trim();
  return fullName || (enriched as any)?.name || fallback;
};

const OnlineUsersPopover: React.FC<OnlineUsersPopoverProps> = ({
  onlineUsernames,
  members,
  myXmppUsername,
  isChatActive,
}) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Presence only carries bare xmppUsernames - join against the room roster
  // and the global user dictionary (populated from message <data> stamps /
  // API enrichment) to get display names, same pattern ChatProfileModal
  // already uses for its member list.
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const entries = useMemo(() => {
    return onlineUsernames.map((username) => {
      const localPart = username.split('@')[0];
      const member = (members || []).find(
        (m) => m.xmppUsername === username
      );
      const enriched =
        member || (usersSet as any)?.[username] || (usersSet as any)?.[localPart];
      const isSelf = isSameXmppUsername(username, myXmppUsername);
      return {
        username,
        isSelf,
        name: isSelf ? 'You' : resolveDisplayName(enriched, localPart),
      };
    });
  }, [onlineUsernames, members, usersSet, myXmppUsername]);

  if (onlineUsernames.length === 0) return null;

  return (
    <Container ref={containerRef}>
      <Trigger
        active={!!isChatActive}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
      >
        {t('presence.onlineCount', { count: onlineUsernames.length })}
      </Trigger>
      {isOpen && (
        <Popover onClick={(e) => e.stopPropagation()}>
          {entries.map((entry) => (
            <Row key={entry.username}>
              <Dot />
              <Name>{entry.name}</Name>
            </Row>
          ))}
        </Popover>
      )}
    </Container>
  );
};

export default OnlineUsersPopover;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
`;

const Trigger = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: boolean }>`
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: 400;
  color: ${({ active }) => (active ? 'rgba(255, 255, 255, 0.85)' : '#22c55e')};
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`;

const Popover = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 200px;
  max-width: 260px;
  max-height: 280px;
  overflow-y: auto;
  background-color: #fff;
  border-radius: 12px;
  padding: 8px;
  box-shadow:
    0px 0px 6px -2px #12121908,
    0px 0px 16px -4px #12121914;
  animation: ${fadeIn} 0.15s ease-out;
  cursor: default;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;

  &:hover {
    background-color: #f5f5f5;
  }
`;

const Dot = styled.span`
  width: 8px;
  height: 8px;
  min-width: 8px;
  border-radius: 50%;
  background-color: #22c55e;
`;

const Name = styled.span`
  font-size: 14px;
  color: #141414;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

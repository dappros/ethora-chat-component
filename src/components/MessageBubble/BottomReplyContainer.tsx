import { FC, useMemo } from 'react';
import { IReply, IUser } from '../../types/types';
import { Avatar } from './Avatar';
import { styled } from 'styled-components';

const ReplyContainer = styled.button<{ $isUser: boolean; $color: string }>`
  background-color: var(--ethora-color-bg, #ffffff);
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  font-size: var(--ethora-font-size-sm, 13px);
  padding: 4px 8px 4px 16px;
  border-radius: var(--ethora-radius-full, 999px);
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${({ $color }) => $color || 'var(--ethora-color-primary, #0052cd)'};
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const AvatarCircle = styled.div`
  height: 24px;
  width: 24px;
  margin-left: -10px;

  @media (max-width: 700px) {
    height: 20px;
    width: 20px;
  }
`;

const CircleCurrent = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 1px solid var(--ethora-color-border, #f0f0f0);
  border-radius: 50%;
  background-color: var(--ethora-color-bg, #ffffff);
  color: var(--ethora-color-text-secondary, #8c8c8c);
  font-size: 11px;
  font-weight: 100;
`;

interface BottomReplyContainerProps {
  isUser: boolean;
  reply: IReply[];
  color: string;
  onClick: () => void;
}

export const BottomReplyContainer: FC<BottomReplyContainerProps> = ({
  isUser,
  reply,
  color,
  onClick,
}) => {
  const uniqueUsers: IUser[] = useMemo(() => {
    const userMap = new Map<string, IUser>();

    reply.forEach((item) => {
      if (!userMap.has(item.user.id)) {
        userMap.set(item.user.id, { ...item.user });
      }
    });

    return Array.from(userMap.values());
  }, [reply]);

  //TODO Add user avatars

  return (
    <ReplyContainer onClick={onClick} $isUser={isUser} $color={color}>
      <div style={{ display: 'flex' }}>
        {uniqueUsers.slice(0, 3).map((item) => (
          <AvatarCircle key={item.id}>
            <Avatar
              username={item.name}
              style={{
                height: '100%',
                width: '100%',
                border: 'solid 1px #F0F0F0',
                fontSize: '11px',
              }}
            />
          </AvatarCircle>
        ))}
        {uniqueUsers.length > 3 && (
          <AvatarCircle>
            <CircleCurrent>+{uniqueUsers.length - 3}</CircleCurrent>
          </AvatarCircle>
        )}
      </div>
      <span>
        {reply.length} {reply.length > 1 ? 'replies' : 'reply'}
      </span>
    </ReplyContainer>
  );
};

import { FC, useMemo } from 'react';
import { IReply, IUser } from '../../types/types';
import { Avatar } from './Avatar';
import { styled } from 'styled-components';

interface BottomReplyContainerProps {
  reply: IReply[];
  onClick: () => void;
};

const ReplyContainer = styled.button`
  position: absolute;
  box-shadow: 0px 0px 8px 0px rgba(185,198,199,1);
  background-color: #ffffff;
  bottom: -28px;
  font-size: 14px;
  padding: 4px 8px 4px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #0052CD;
  font-weight: 600;
  border: none;
`;

export const BottomReplyContainer: FC<BottomReplyContainerProps> = ({ reply, onClick }) => {
  const uniqueUsers: IUser[] = useMemo(() => {
    return Object.values(
      reply.reduce((acc, item) => {
        if (!acc[item.user.id]) {
          acc[item.user.id] = {
            ...item.user
          };
        }
        return acc;
      }, {})
    );
  }, [reply]);

  return (
    <ReplyContainer onClick={onClick}>
      <div style={{ display: 'flex' }}>
        {uniqueUsers.map((item) => (
          <Avatar
            key={item.id}
            username={item.name}
            style={{
              marginLeft: "-10px",
              height: "24px",
              width: "24px",
              border: "solid 1px #ffffff",
              fontSize: "11px",
            }} />
        ))}
      </div>
      <span>{reply.length} {reply.length > 1 ? 'replies' : 'reply'}</span>
    </ReplyContainer>
  )
};

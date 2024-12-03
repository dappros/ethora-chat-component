import { FC, useMemo } from 'react';
import { IReply, IUser } from '../../types/types';
import { Avatar } from './Avatar';
import { styled } from 'styled-components';

interface BottomReplyContainerProps {
  isUser: boolean;
  reply: IReply[];
  onClick: () => void;
}

const ReplyContainer = styled.button<{isUser: boolean}>`
  position: absolute;
  box-shadow: 0px 0px 8px 0px rgba(185, 198, 199, 1);
  background-color: #ffffff;
  bottom: -24px;
  left: ${(props) => !props.isUser && '50px'};
  right: ${(props) => props.isUser && '10px'};
  font-size: 14px;
  padding: 4px 8px 4px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #0052cd;
  font-weight: 600;
  border: none;
  cursor: pointer;

    @media (max-width: 675px) {
    font-size: 12px;
      bottom: -24px;
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
`

const CircleCurrent = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 1px solid #F0F0F0;
  border-radius: 50%;
  background-color: #ffffff;
  color: #8C8C8C;
  font-size: 11px;
  font-weight: 100;
`

export const BottomReplyContainer: FC<BottomReplyContainerProps> = ({
  isUser,
  reply,
  onClick,
}) => {
  const uniqueUsers: IUser[] = useMemo(() => {
    return Object.values(
      reply.reduce((acc, item) => {
        if (!acc[item.user.id]) {
          acc[item.user.id] = {
            ...item.user,
          };
        }
        return acc;
      }, {})
    );
  }, [reply]);

  return (
    <ReplyContainer onClick={onClick} isUser={isUser}>
      <div style={{ display: 'flex' }}>
        {uniqueUsers.slice(0, 3).map((item) => (
          <AvatarCircle>
            <Avatar
              key={item.id}
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
            <CircleCurrent>
              +{uniqueUsers.length - 3}
            </CircleCurrent>
          </AvatarCircle>
        )}
      </div>
      <span>
        {reply.length} {reply.length > 1 ? 'replies' : 'reply'}
      </span>
    </ReplyContainer>
  );
};

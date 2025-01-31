import { FC, useMemo } from 'react';
import emojiData from '@emoji-mart/data';
import { styled } from 'styled-components';
import { ReactionMessage } from '../../types/types';

const ReactionContainer = styled.div`
  gap: 8px;
  display: flex;
  align-items: center;
  border: none;
  background: transparent;
`;

const ReactionBox = styled.button<{ color: string }>`
  box-shadow: 0px 0px 8px 0px rgba(185, 198, 199, 1);
  background-color: #ffffff;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ color }) => color || '#8C8C8C'};
  font-weight: 600;
  border: none;
  cursor: pointer;
  position: relative;

  &:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }
`;

const Tooltip = styled.div`
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.3s;
  position: absolute;
  bottom: 120%;
  left: 50%;
  transform: translateX(-50%);
  background-color: #333;
  color: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
`;

interface MessageReactionProps {
  color: string;
  reaction: Record<string, ReactionMessage>;
  changeReaction: (reaction: string) => void;
}

export const MessageReaction: FC<MessageReactionProps> = ({
  reaction,
  color,
  changeReaction,
}) => {
  const memoEmoji = (id: string) => {
    const emoji = (emojiData as any).emojis[id];
    return emoji ? emoji.skins[0].native : '';
  };

  if (!reaction) return null;

  const reactionDetails = useMemo(() => {
    const result: Record<string, { count: number; users: string[] }> = {};

    Object.values(reaction).forEach(({ emoji, data }) => {
      if (emoji && emoji.length > 0)
        emoji.forEach((em) => {
          if (!result[em]) {
            result[em] = { count: 0, users: [] };
          }
          result[em].count += 1;
          result[em].users.push(
            `${data.senderFirstName} ${data.senderLastName}`
          );
        });
    });

    return result;
  }, [reaction]);

  return (
    <ReactionContainer>
      {Object.entries(reactionDetails).map(([emoji, details]) => (
        <ReactionBox
          key={emoji}
          onClick={() => changeReaction(emoji)}
          color={color}
        >
          {memoEmoji(emoji)} {details.count}
          <Tooltip className="tooltip">{details.users.join(', ')}</Tooltip>
        </ReactionBox>
      ))}
    </ReactionContainer>
  );
};

import { FC, useMemo } from 'react';
import { getEmojiNativeById, useEmojiData } from '../../helpers/lazyEmoji';
import { styled } from 'styled-components';
import { ReactionMessage } from '../../types/types';
import { fadeInAnimation } from '../../styles/motion';

const ReactionContainer = styled.div`
  gap: 6px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  border: none;
  background: transparent;
  z-index: 1;
  ${fadeInAnimation}
`;

// Rounded pill chip, tokenized border instead of a drop-shadow ring so it
// reads as a chip rather than a floating card.
const ReactionBox = styled.button<{ color: string }>`
  background-color: var(--ethora-color-bg, #ffffff);
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  font-size: var(--ethora-font-size-sm, 13px);
  padding: 4px 8px;
  border-radius: var(--ethora-radius-full, 999px);
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
  color: ${({ color }) => color || 'var(--ethora-color-text-secondary, #8C8C8C)'};
  font-weight: 600;
  cursor: pointer;
  position: relative;
  transition: background-color var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }

  &:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }
`;

const Tooltip = styled.div`
  visibility: hidden;
  opacity: 0;
  transition: opacity var(--ethora-motion-base, 220ms);
  position: absolute;
  bottom: 120%;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--ethora-color-text, #333);
  color: var(--ethora-color-text-on-primary, #fff);
  padding: 6px 10px;
  border-radius: var(--ethora-radius-sm, 6px);
  font-size: 12px;
  white-space: nowrap;
`;

interface MessageReactionProps {
  color: string;
  reaction: Record<string, ReactionMessage>;
  changeReaction: (reaction: string) => void;
  userName?: string;
}

export const MessageReaction: FC<MessageReactionProps> = ({
  reaction,
  color,
  changeReaction,
  userName,
}) => {
  useEmojiData();
  const memoEmoji = getEmojiNativeById;

  const reactionDetails = useMemo(() => {
    if (!reaction) {
      return {};
    }

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

  if (!reaction) return null;

  return (
    <ReactionContainer>
      {Object.entries(reactionDetails).map(([emoji, details]) => (
        <ReactionBox
          key={emoji}
          onClick={() => changeReaction(emoji)}
          color={userName && details.users.includes(userName) ? '#fff' : color}
          style={{
            backgroundColor: !details.users.includes(userName || '')
              ? '#fff'
              : color,
          }}
        >
          {memoEmoji(emoji)} {details.count}
          <Tooltip className="tooltip">{details.users.join(', ')}</Tooltip>
        </ReactionBox>
      ))}
    </ReactionContainer>
  );
};

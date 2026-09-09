import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import { QuickReply, markQuickRepliesAnswered } from '../../helpers/quickReplies';

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

// Outlined rather than filled: these sit inside a bot bubble that already has
// a background, and a row of solid buttons there reads as a toolbar. The
// accent comes from the host's primary colour so a branded widget tints them
// without any extra config.
const Chip = styled.button<{ $accent: string }>`
  background: transparent;
  border: 1px solid ${(props) => props.$accent};
  border-radius: 16px;
  color: ${(props) => props.$accent};
  cursor: pointer;
  font-family: var(--ethora-font-family, inherit);
  font-size: var(--ethora-font-size-sm, 0.8125rem);
  line-height: 1.4;
  padding: 5px 12px;
  transition: background-color 0.15s ease, opacity 0.15s ease;

  &:hover:not(:disabled) {
    background-color: ${(props) => props.$accent};
    color: #fff;
  }

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }
`;

interface QuickRepliesProps {
  replies: QuickReply[];
  messageId: string;
  accentColor?: string;
  /** Already answered (in this session) - chips render disabled. */
  answered?: boolean;
  onSelect: (reply: QuickReply, questionId: string) => void;
}

/**
 * Buttons offered by a bot message. Tapping one answers the message: the
 * chips lock immediately (so a double tap cannot post two answers) and stay
 * visible, which keeps the transcript readable - you can still see what the
 * options were next to the answer that was picked.
 */
const QuickReplies: React.FC<QuickRepliesProps> = ({
  replies,
  messageId,
  accentColor,
  answered,
  onSelect,
}) => {
  const [locked, setLocked] = useState(!!answered);
  const accent = accentColor || '#0052CD';

  const handleClick = useCallback(
    (reply: QuickReply, index: number) => {
      if (locked) return;
      setLocked(true);
      markQuickRepliesAnswered(messageId);
      onSelect(reply, reply.questionId ?? String(index));
    },
    [locked, messageId, onSelect]
  );

  if (!replies.length) return null;

  return (
    <Row role="group" aria-label="Quick replies">
      {replies.map((reply, index) => (
        <Chip
          key={`${messageId}-${reply.questionId ?? index}-${reply.value}`}
          type="button"
          $accent={accent}
          disabled={locked}
          onClick={() => handleClick(reply, index)}
        >
          {reply.name}
        </Chip>
      ))}
    </Row>
  );
};

export default QuickReplies;

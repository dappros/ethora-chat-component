import React, { useCallback, useState, type CSSProperties } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  QuickReply,
  markQuickRepliesAnswered,
} from '../../helpers/quickReplies';
import type { ChatColorScheme } from '../../types/types';
import { useResolvedColorScheme } from '../../styles/tokens';

// One rise-and-fade per pill, staggered by --qr-i. `backwards` (not `both`)
// so the end state never outranks the hover transform.
const rise = keyframes`
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
`;

// The brand colour comes from the --ethora-color-primary token, which the
// ThemeTokens provider derives from config.colors.primary. The accent prop is
// only the fallback for hosts that render outside that provider. In dark
// scheme the tokens already lift primary for legibility; the tint strengths
// go up so the pills still read as fills on a dark bubble.
const Row = styled.div<{ $dark: boolean; $accent: string }>`
  --qr-primary: var(--ethora-color-primary, ${(props) => props.$accent});
  --qr-text: ${(props) =>
    props.$dark
      ? 'color-mix(in srgb, var(--qr-primary) 70%, #fff)'
      : 'var(--ethora-color-primary-text, var(--qr-primary))'};
  --qr-tint: ${(props) => (props.$dark ? '14%' : '6%')};
  --qr-tint-hover: ${(props) => (props.$dark ? '22%' : '12%')};

  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
  margin-top: 10px;
  max-width: 100%;
`;

const Chip = styled.button`
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  padding: 8px 14px;
  border: 1.5px solid color-mix(in srgb, var(--qr-primary) 45%, transparent);
  border-radius: 999px;
  background-color: color-mix(
    in srgb,
    var(--qr-primary) var(--qr-tint),
    transparent
  );
  color: var(--qr-text);
  cursor: pointer;
  font-family: var(--ethora-font-family, inherit);
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.2;
  text-align: left;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
  animation: ${rise} 160ms ease backwards;
  animation-delay: calc(var(--qr-i, 0) * 30ms);

  &:hover {
    background-color: color-mix(
      in srgb,
      var(--qr-primary) var(--qr-tint-hover),
      transparent
    );
    border-color: color-mix(in srgb, var(--qr-primary) 70%, transparent);
    box-shadow: 0 2px 6px color-mix(in srgb, var(--qr-primary) 18%, transparent);
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--qr-primary) 40%, transparent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transition:
      background-color 160ms ease,
      border-color 160ms ease;

    &:hover,
    &:active {
      transform: none;
    }
  }
`;

// Single line, ellipsised at the bubble width. The button caps at 100% of the
// row, the label inside it truncates; the full text stays in `title`.
const Label = styled.span`
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

interface QuickRepliesProps {
  replies: QuickReply[];
  messageId: string;
  accentColor?: string;
  colorScheme?: ChatColorScheme;
  /** Already answered - the chips are gone for good. */
  answered?: boolean;
  onSelect: (reply: QuickReply, questionId: string) => void;
}

/**
 * Buttons offered by a bot message. Tapping one answers the message and the
 * whole row disappears: the answer is already in the transcript as the
 * user's own message, so leaving spent options on screen only invites a
 * second tap on a question that is closed. Removing them is also what makes
 * a double tap impossible rather than merely refused.
 */
const QuickReplies: React.FC<QuickRepliesProps> = ({
  replies,
  messageId,
  accentColor,
  colorScheme,
  answered,
  onSelect,
}) => {
  const [locked, setLocked] = useState(!!answered);
  const accent = accentColor || '#0052CD';
  const dark = useResolvedColorScheme(colorScheme) === 'dark';

  const handleClick = useCallback(
    (reply: QuickReply, index: number) => {
      if (locked) return;
      setLocked(true);
      markQuickRepliesAnswered(messageId);
      onSelect(reply, reply.questionId ?? String(index));
    },
    [locked, messageId, onSelect]
  );

  // Answered: nothing left to offer.
  if (!replies.length || locked) return null;

  return (
    <Row role="group" aria-label="Quick replies" $dark={dark} $accent={accent}>
      {replies.map((reply, index) => (
        <Chip
          key={`${messageId}-${reply.questionId ?? index}-${reply.value}`}
          type="button"
          title={reply.name}
          style={{ '--qr-i': index } as CSSProperties}
          onClick={() => handleClick(reply, index)}
        >
          <Label>{reply.name}</Label>
        </Chip>
      ))}
    </Row>
  );
};

export default QuickReplies;

import { FC, useId, useMemo, useRef, useState } from 'react';
import { css, keyframes, styled } from 'styled-components';
import { getEmojiNativeById, useEmojiData } from '../../helpers/lazyEmoji';
import { ReactionMessage } from '../../types/types';
import { MOTION_EASE, reducedMotion } from '../../styles/motion';
import { useT } from '../../i18n/useT';

/** Distinct emojis shown before the "+N" chip takes over the rest. */
const MAX_VISIBLE_REACTIONS = 6;
/** Room the tooltip needs above a chip before it flips below, in px. */
const TOOLTIP_ROOM_ABOVE_PX = 56;
/** Horizontal room needed to centre the tooltip on a chip, in px. */
const TOOLTIP_EDGE_PX = 130;

type Translate = (
  key: string,
  vars?: Record<string, string | number>
) => string;

// The row straddles the bottom edge of its bubble: the bubble positions it
// (absolute, half above and half below the edge, on the side it hugs), so it
// is never in the bubble's flow. 4px between chips; it wraps inside the bubble
// width minus the 8px inset, so a narrow bubble wraps instead of spilling.
const ReactionContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: calc(100% - 16px);
`;

const reactionPop = keyframes`
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

// A chip is a pill: 24px tall, 8px side padding, 12px radius. Its resting
// tint is the bubble's --ethora-reaction-chip-bg when the bubble sets one (own
// bubbles do), otherwise the primary colour at 6%. `backwards` fill so the pop
// does not hold its end frame and override the hover transform.
const chipBase = css<{ $accent: string }>`
  box-sizing: border-box;
  height: 24px;
  margin: 0;
  padding: 0 8px;
  border-radius: 12px;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  font: inherit;
  color: var(--ethora-color-text, #141414);
  background-color: var(
    --ethora-reaction-chip-bg,
    color-mix(in srgb, ${({ $accent }) => $accent} 6%, transparent)
  );
  cursor: pointer;
  white-space: nowrap;
  /* Ring in the page colour so a chip reads as separate from the bubble edge
     it straddles. */
  box-shadow: 0 0 0 2px var(--ethora-color-bg, #ffffff);
  transition:
    background-color var(--ethora-motion-fast, 150ms) ${MOTION_EASE},
    transform var(--ethora-motion-fast, 150ms) ${MOTION_EASE},
    box-shadow var(--ethora-motion-fast, 150ms) ${MOTION_EASE};
  animation: ${reactionPop} 120ms ${MOTION_EASE} backwards;
  ${reducedMotion}

  &:hover {
    background-color: color-mix(
      in srgb,
      ${({ $accent }) => $accent} 12%,
      transparent
    );
    transform: translateY(-1px);
    box-shadow:
      0 0 0 2px var(--ethora-color-bg, #ffffff),
      0 2px 4px rgba(16, 24, 40, 0.14);
  }

  &:active {
    transform: scale(0.96);
  }

  &:focus-visible {
    outline: 2px solid ${({ $accent }) => $accent};
    outline-offset: 2px;
  }
`;

// Own reaction (aria-pressed) is the highlighted state. It is declared after
// :hover so it wins, and it gets its own hover step so the chip still reacts.
const ReactionBox = styled.button<{ $accent: string }>`
  ${chipBase}

  &[aria-pressed='true'] {
    background-color: color-mix(
      in srgb,
      ${({ $accent }) => $accent} 14%,
      transparent
    );
    border-color: color-mix(in srgb, ${({ $accent }) => $accent} 45%, transparent);
    color: ${({ $accent }) => $accent};
  }

  &[aria-pressed='true']:hover {
    background-color: color-mix(
      in srgb,
      ${({ $accent }) => $accent} 18%,
      transparent
    );
  }
`;

const MoreBox = styled.button<{ $accent: string }>`
  ${chipBase}
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const ReactionEmoji = styled.span`
  font-size: 14px;
  line-height: 1;
`;

const ReactionCount = styled.span`
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
`;

const tooltipFade = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

// Chip and tooltip are siblings: a div inside a button is invalid markup. The
// tooltip shows on CSS hover after a 160ms delay, and on keyboard focus.
const ChipWrap = styled.span`
  position: relative;
  display: inline-flex;
  max-width: 100%;

  &:hover > .reaction-tooltip,
  .reaction-chip:focus-visible + .reaction-tooltip {
    display: block;
    animation: ${tooltipFade} 120ms ease 160ms backwards;
    ${reducedMotion}
  }
`;

// Dark glass tooltip with an arrow. It is positioned above the chip, flips
// below it near the top of the viewport, and shifts sideways near an edge.
const Tooltip = styled.span<{
  $below: boolean;
  $align: 'start' | 'center' | 'end';
}>`
  position: absolute;
  z-index: 3;
  ${({ $below }) =>
    $below ? 'top: calc(100% + 8px);' : 'bottom: calc(100% + 8px);'}
  ${({ $align }) =>
    $align === 'start'
      ? 'left: 0;'
      : $align === 'end'
        ? 'right: 0;'
        : 'left: 50%; transform: translateX(-50%);'}
  width: max-content;
  max-width: min(240px, 70vw);
  padding: 6px 10px;
  border-radius: 8px;
  background-color: rgba(17, 24, 39, 0.9);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(16, 24, 40, 0.24);
  color: #fff;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  text-align: left;
  white-space: normal;
  pointer-events: none;
  /* Not rendered until hover or focus: a hidden box would still widen the
     bubble's scrollable area. */
  display: none;

  &::after {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    background-color: rgba(17, 24, 39, 0.9);
    transform: rotate(45deg);
    ${({ $below }) => ($below ? 'top: -4px;' : 'bottom: -4px;')}
    ${({ $align }) =>
      $align === 'start'
        ? 'left: 12px;'
        : $align === 'end'
          ? 'right: 12px;'
          : 'left: calc(50% - 4px);'}
  }
`;

interface MessageReactionProps {
  color: string;
  reaction: Record<string, ReactionMessage>;
  changeReaction: (reaction: string) => void;
  userName?: string;
}

interface ReactionDetails {
  count: number;
  users: string[];
}

type Placement = { below: boolean; align: 'start' | 'center' | 'end' };

const buildTooltip = (t: Translate, glyph: string, users: string[]): string => {
  const [first, second] = users;
  if (users.length === 1) {
    return t('reaction.tooltip.one', { name: first, emoji: glyph });
  }
  if (users.length === 2) {
    return t('reaction.tooltip.two', { first, second, emoji: glyph });
  }
  // Three or more: name the first two, then count everyone else.
  const others = users.length - 2;
  return t(others === 1 ? 'reaction.tooltip.other' : 'reaction.tooltip.others', {
    first,
    second,
    count: others,
    emoji: glyph,
  });
};

interface ReactionChipProps {
  emoji: string;
  glyph: string;
  details: ReactionDetails;
  mine: boolean;
  accent: string;
  onPress: (emoji: string) => void;
  tooltip: string;
}

const ReactionChip: FC<ReactionChipProps> = ({
  emoji,
  glyph,
  details,
  mine,
  accent,
  onPress,
  tooltip,
}) => {
  const t = useT();
  const tooltipId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<Placement>({
    below: false,
    align: 'center',
  });

  // Hover and focus are the only moments the tooltip shows, so measure then.
  const measure = () => {
    const el = wrapRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const next: Placement = {
      below: rect.top < TOOLTIP_ROOM_ABOVE_PX,
      align:
        rect.left < TOOLTIP_EDGE_PX
          ? 'start'
          : window.innerWidth - rect.right < TOOLTIP_EDGE_PX
            ? 'end'
            : 'center',
    };
    setPlacement((prev) =>
      prev.below === next.below && prev.align === next.align ? prev : next
    );
  };

  const label = t(mine ? 'reaction.aria.mine' : 'reaction.aria.theirs', {
    emoji: glyph,
    count: details.count,
  });

  return (
    <ChipWrap ref={wrapRef} onMouseEnter={measure} onFocus={measure}>
      <ReactionBox
        type="button"
        className="reaction-chip"
        aria-pressed={mine}
        aria-label={label}
        aria-describedby={tooltipId}
        $accent={accent}
        onClick={() => onPress(emoji)}
      >
        <ReactionEmoji aria-hidden="true">{glyph}</ReactionEmoji>
        <ReactionCount aria-hidden="true">{details.count}</ReactionCount>
      </ReactionBox>
      <Tooltip
        id={tooltipId}
        role="tooltip"
        className="reaction-tooltip"
        $below={placement.below}
        $align={placement.align}
      >
        {tooltip}
      </Tooltip>
    </ChipWrap>
  );
};

export const MessageReaction: FC<MessageReactionProps> = ({
  reaction,
  color,
  changeReaction,
  userName,
}) => {
  useEmojiData();
  const t = useT();
  const memoEmoji = getEmojiNativeById;
  const [expanded, setExpanded] = useState(false);

  const reactionDetails = useMemo(() => {
    if (!reaction) {
      return {};
    }

    const result: Record<string, ReactionDetails> = {};

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

  const entries = Object.entries(reactionDetails);
  if (entries.length === 0) return null;

  const overflowing = entries.length > MAX_VISIBLE_REACTIONS && !expanded;
  const visible = overflowing
    ? entries.slice(0, MAX_VISIBLE_REACTIONS)
    : entries;
  const hiddenCount = entries.length - MAX_VISIBLE_REACTIONS;

  return (
    <ReactionContainer className="reaction-row">
      {visible.map(([emoji, details]) => {
        const glyph = memoEmoji(emoji);
        return (
          <ReactionChip
            key={emoji}
            emoji={emoji}
            glyph={glyph}
            details={details}
            mine={!!userName && details.users.includes(userName)}
            accent={color}
            onPress={changeReaction}
            tooltip={buildTooltip(t, glyph, details.users)}
          />
        );
      })}
      {overflowing && (
        <MoreBox
          type="button"
          aria-label={t('reaction.more', { count: hiddenCount })}
          $accent={color}
          onClick={() => setExpanded(true)}
        >
          +{hiddenCount}
        </MoreBox>
      )}
    </ReactionContainer>
  );
};

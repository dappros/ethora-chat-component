import styled, { css } from 'styled-components';
import { fadeInAnimation, scaleInAnimation } from '../../styles/motion';
import {
  MEDIA_WIDTH_CSS,
  MEDIA_WIDTH_RULE,
  MEDIA_WIDTH_VAR,
} from '../../helpers/mediaBox';

export const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  background: linear-gradient(135deg, #f8f9ff 0%, #f3f6fc 100%);
  [data-ethora-color-scheme='dark'] & {
    background: var(--ethora-color-chat-bg);
  }
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
`;

export const ChatContainerHeader = styled.div`
  display: flex;
  border-radius: 0px 0px 15px 15px;
  box-shadow: 1px -1px 10px 0 rgba(0, 0, 0, 0.25);
  padding: 16px;
  background-color: var(--ethora-color-bg, #fff);
  z-index: 1;
  justify-content: space-between;
`;

export const ChatContainerHeaderBoxInfo = styled.div`
  display: flex;
  gap: 8px;
  cursor: pointer;
`;

export const ChatContainerHeaderInfo = styled.div`
  text-align: start;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const ChatContainerHeaderLabel = styled.div`
  color: var(--ethora-color-text, #141414);
  font-weight: 600;
  font-size: var(--ethora-font-size, 16px);
`;

export const NonRoomChat = styled.div`
  height: 100%;
  width: 100%;
  align-items: center;
  display: flex;
  justify-content: center;
  background-color: var(--ethora-color-bg, #fff);
  flex-direction: column;
  gap: 16;
`;

export const MessagesScroll = styled.div<{ color?: string }>`
  position: relative;
  height: calc(100%);
  overflow: hidden;
  overflow-y: scroll;
  /* MessageList compensates for history prepended above the reader itself;
     the browser's own anchoring on top of that moves them twice. */
  overflow-anchor: none;
  /* One width for the media block of every message (album, picture, file
     cards), from this pane's own width, not the viewport. */
  ${MEDIA_WIDTH_VAR}: ${MEDIA_WIDTH_RULE};
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--ethora-chat-bg, var(--ethora-color-chat-bg, #f3f6fc));
  background-image: var(--ethora-chat-bg-image, none);
  background-size: cover;
  background-position: center;
  padding: 0px 16px;

  transition: height 0.3s ease-in-out; /* Smooth height transition */

  /* WebKit-based browsers (Chrome, Safari) */
  ::-webkit-scrollbar {
    width: 4px; /* Width of the scrollbar */
  }

  ::-webkit-scrollbar-thumb {
    background-color: ${(props) =>
      props?.color ? props?.color : 'var(--ethora-color-border, #E6E8EC)'};
    border-radius: var(--ethora-radius-full, 999px); /* Rounded corners for the thumb */
  }

  ::-webkit-scrollbar-track {
    background-color: transparent; /* Background color of the track */
  }

  /* Firefox */
  scrollbar-width: thin; /* Make the scrollbar thinner */
  scrollbar-color: ${(props) =>
      props?.color ? props?.color : 'var(--ethora-color-border, #E6E8EC)'}
    transparent; /* Color of the thumb and track */
`;

/**
 * Bottom anchoring for the real transcript, as two nested wrappers inside
 * MessagesScroll.
 *
 * A conversation shorter than the viewport used to hang from the TOP of the
 * pane, leaving a wall of empty space under it, while the opening preview
 * (ChatRoomOpeningPreview) that stands in for it a moment earlier sits at
 * the BOTTOM, like every messenger. So a room with one message showed it
 * low while loading and then jumped it to the top the instant history
 * arrived - and which of the two you saw depended on the room.
 *
 * MessagesAnchor grows to at least the viewport and pushes its single child
 * to the bottom. It is NOT the scroller (MessagesScroll still is), so
 * justify-content: flex-end is safe here: the anchor is exactly as tall as
 * its content once that overflows, and the top of a long list stays
 * reachable.
 *
 * MessagesFlow is the reason there are two wrappers, and it is easy to
 * "simplify" away: the messages must stay in ordinary block flow. Made
 * direct flex items they lose margin collapsing, which measurably added
 * 110-150px to a real conversation and changed the gaps between bubbles.
 * One flex item containing all of them keeps the old spacing exactly.
 */
export const MessagesAnchor = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 100%;
`;

export const MessagesFlow = styled.div`
  flex: 0 0 auto;
`;

export const MessagesList = styled.div`
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* As a column-flex child of ChatContainer, without flex:1 + min-height:0
     this sizes itself off its own content height instead of shrinking to
     the space actually left over after the header/composer - on mobile
     that pushes the composer below the visible viewport until scrolled. */
  flex: 1;
  min-height: 0;
  position: relative;
  color: #000000de;
  [data-ethora-color-scheme='dark'] & {
    color: var(--ethora-color-text);
  }
  /* MessageList is keyed by activeRoomJID in ChatRoom.tsx, so this remounts
     - and this fade plays - exactly once per room switch (and on first
     load), not on every re-render or scroll: a CSS animation only runs
     when it starts applying to a node, which for a static (non-conditional)
     rule is when the node itself is created. A settle-in on the content
     reads far better than the list just swapping in place. */
  ${fadeInAnimation}
`;

export const MessageTimestamp = styled.div`
  font-size: 0.75rem;
  color: #666;
  margin-bottom: 5px;
  [data-ethora-color-scheme='dark'] & {
    color: var(--ethora-color-text-muted);
  }
`;

export const Message = styled.div<{ $isUser: boolean }>`
  background-color: ${(props) => (props.$isUser ? '#dcf8c6' : '#f1f1f1')};
  padding: 10px;
  margin: 10px 0;
  border-radius: 8px;
  max-width: 70%;
  flex-direction: ${(props) => (!props.$isUser ? 'row' : 'row-reverse')};
  overflow: hidden;
  word-wrap: break-word;
`;

export const MessageText = styled.p`
  margin: 0;
`;

export const UserName = styled.span`
  font-weight: bold;
`;

export const InputContainer = styled.div`
  display: flex;
  border-radius: 15px 15px 0px 0px;
  background-color: #fff;
  flex-direction: column;
  gap: 5px;
`;

export const MessageInput = styled.input`
  flex-grow: 1;
  padding: 10px;
  border-radius: 8px;
  border: none;
  margin-right: 10px;
`;

export const SendButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background-color: #007bff;
  color: black;
  cursor: pointer;
  box-shadow: 1px -1px 10px 0 rgba(0, 0, 0, 0.25);

  &:hover {
    background-color: #0056b3;
  }
`;

export const CustomMessageContainer = styled.div<{
  $isUser: boolean;
  $reply: boolean;
  /** The bubble carries a reaction row that hangs below its bottom edge. */
  $reaction?: boolean;
}>`
  display: flex;
  flex-direction: ${(props) => (props.$isUser ? 'row-reverse' : 'row')};
  align-items: flex-end;
  margin: 10px 0;
  gap: 5px;
  position: relative;
  margin-bottom: ${(props) =>
    props.$reply ? '40px' : props.$reaction ? '14px' : '10px'};
`;

// 16px radius, with a smaller radius on the corner nearest the avatar (the
// "tail" side) so the bubble reads as pointing at its sender, iMessage/
// Telegram-style. Own-message background defaults to the primary-soft token;
// other-message gets a neutral surface plus a 1px border since it no longer
// has a tint of its own to separate it from the page background.
/**
 * Visual inset between a bubble's edge and what it holds, in px. A bubble with
 * a 1px border (anyone else's message) takes one px less of padding so the
 * visual inset still matches.
 *
 * Media bubbles (pictures, videos, file cards, voice notes) use 6px on every
 * side, the compact Telegram-style inset that the media block aligns to. Text
 * bubbles use 8px vertical and 12px horizontal.
 */
export const MEDIA_BUBBLE_INSET_PX = 6;
export const TEXT_BUBBLE_INSET_Y_PX = 8;
export const TEXT_BUBBLE_INSET_X_PX = 12;
/** Bubble corner radius; media inside it is concentric (radius minus inset). */
export const BUBBLE_RADIUS_PX = 18;
export const MEDIA_RADIUS_PX = BUBBLE_RADIUS_PX - MEDIA_BUBBLE_INSET_PX;
/** Glass time pill over media: how far it sits inside the media edge, in px. */
export const MEDIA_TIME_PILL_OFFSET_PX = 8;

const bubbleBordered = (props: { $isUser: boolean; $deleted: boolean }) =>
  !props.$deleted && !props.$isUser;

/** Padding (CSS shorthand value) that yields the visual inset, net of the border. */
export const bubblePadding = (props: {
  $isUser: boolean;
  $deleted: boolean;
  $media?: boolean;
}) => {
  const border = bubbleBordered(props) ? 1 : 0;
  const y = (props.$media ? MEDIA_BUBBLE_INSET_PX : TEXT_BUBBLE_INSET_Y_PX) - border;
  const x = (props.$media ? MEDIA_BUBBLE_INSET_PX : TEXT_BUBBLE_INSET_X_PX) - border;
  return y === x ? `${y}px` : `${y}px ${x}px`;
};

// 16px radius, with a smaller radius on the corner nearest the avatar (the
// "tail" side) so the bubble reads as pointing at its sender, iMessage/
// Telegram-style. Own-message background defaults to the primary-soft token;
// other-message gets a neutral surface plus a 1px border since it no longer
// has a tint of its own to separate it from the page background.
/** How far a reaction row hangs below the bubble's bottom edge, in px. */
export const REACTION_HANG_PX = 12;

export const CustomMessageBubble = styled.div<{
  $isUser: boolean;
  $deleted: boolean;
  /** The bubble has reactions: its bottom padding grows so the row's upper half clears the content. */
  $reactions?: boolean;
  /** The bubble carries a media block (pictures, videos, cards, voice notes). */
  $media?: boolean;
  /** Its only media is one solo picture or video: the bubble hugs it. */
  $solo?: boolean;
}>`
  max-width: ${(props) =>
    props.$media
      ? `min(${MEDIA_WIDTH_CSS}, calc(82% - ${2 * MEDIA_BUBBLE_INSET_PX + 2}px))`
      : '70%'};
  /* Room for the glass time pill over a media-only bubble. */
  min-width: ${(props) => (props.$media ? '120px' : '15%')};
  ${(props) => (props.$media && props.$solo ? 'width: fit-content;' : '')}
  padding: ${(props) => bubblePadding(props)};
  ${(props) =>
    props.$reactions
      ? `padding-bottom: calc(${props.$media ? MEDIA_BUBBLE_INSET_PX : TEXT_BUBBLE_INSET_Y_PX}px - ${bubbleBordered(props) ? 1 : 0}px + ${REACTION_HANG_PX}px);`
      : ''}
  border-radius: ${(props) =>
    props.$isUser
      ? `${BUBBLE_RADIUS_PX}px ${BUBBLE_RADIUS_PX}px var(--ethora-radius-sm, 8px) ${BUBBLE_RADIUS_PX}px`
      : `${BUBBLE_RADIUS_PX}px ${BUBBLE_RADIUS_PX}px ${BUBBLE_RADIUS_PX}px var(--ethora-radius-sm, 8px)`};
  color: var(--ethora-color-text, #141414);
  text-align: left;
  display: flex;
  flex-direction: column;
  background-color: ${(props) =>
    props.$deleted
      ? 'var(--ethora-color-bg-subtle, #dfdfdf)'
      : props.$isUser
        ? 'var(--ethora-own-message-bg, var(--ethora-color-primary-soft, #E7EDF9))'
        : 'var(--ethora-other-message-bg, var(--ethora-color-bg, #FFFFFF))'};
  border: ${(props) =>
    !props.$deleted && !props.$isUser
      ? '1px solid var(--ethora-color-border, #E6E8EC)'
      : '1px solid transparent'};
  position: relative;
  /* Overflow stays visible: the reaction row hangs below the bottom edge. */
  overflow: visible;
  /* The reaction row straddles the bottom edge on the side the bubble hugs:
     right for own messages (right edge of the screen), left for others. */
  & > .reaction-row {
    position: absolute;
    /* Anchored by its first row: that row straddles the bottom edge, and any
       wrapped rows fall below it. */
    top: calc(100% - ${REACTION_HANG_PX}px);
    ${(props) => (props.$isUser ? 'right: 8px;' : 'left: 8px;')}
    z-index: 2;
  }
  /* Reaction chips on an own bubble sit on the tinted surface: a white veil
     reads cleaner there than a primary tint would. */
  ${(props) =>
    props.$isUser
      ? css`
          --ethora-reaction-chip-bg: rgba(255, 255, 255, 0.55);
          [data-ethora-color-scheme='dark'] & {
            --ethora-reaction-chip-bg: rgba(255, 255, 255, 0.12);
          }
        `
      : ''}
`;

export const CustomMessageText = styled.div`
  margin: 0px;
  word-wrap: break-word;
  font-family: var(--ethora-font-family, 'Open Sans', sans-serif);
  font-size: var(--ethora-font-size, 15px);
  line-height: 1.45;

  /* The markdown paragraphs carry their own 12px margins (inline style); at the
     ends of a bubble they would double the padding. */
  .message-body p:first-child {
    margin-top: 0 !important;
  }
  .message-body p:last-child {
    margin-bottom: 0 !important;
  }
`;

export const CustomUserName = styled.span<{
  $isUser: boolean;
  $color?: string;
  /** Inside a media bubble (6px inset): 4px more so it lines up with the caption. */
  $media?: boolean;
}>`
  font-family: var(--ethora-font-family, 'Open Sans', sans-serif);
  font-weight: 600;
  font-size: var(--ethora-font-size-lg, 18px);
  color: ${(props) => props?.$color || 'var(--ethora-color-primary, #0052CD)'};
  /* A brand colour picked for white reads poorly on the dark surface; use
     the lifted text variant of the same colour there. */
  [data-ethora-color-scheme='dark'] & {
    color: var(--ethora-color-primary-text, var(--ethora-color-primary, #0052CD));
  }
  margin-bottom: ${(props) => (props.$media ? '4px' : '2px')};
  ${(props) => (props.$media ? 'padding: 0 4px;' : '')}
`;

export const CustomMessageTimestamp = styled.span<{
  /** Own message: the bubble hugs the right edge, so the time sits bottom-left. */
  $own?: boolean;
  /** Media bubble: the row sits under the media with 2px 8px 4px padding. */
  $media?: boolean;
  /** Text bubble: the time floats at the end of the last line of text. */
  $inline?: boolean;
  /** Glass pill over the media's bottom right corner (media-only bubbles). */
  $overlay?: boolean;
  /** Whether the bubble has its 1px border (it shifts the pill by one px). */
  $bordered?: boolean;
}>`
  font-size: var(--ethora-font-size-xs, 0.75rem);
  align-self: ${(props) => (props.$own ? 'flex-start' : 'flex-end')};
  color: var(--ethora-color-text-muted, #8f8f8f);
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  ${(props) => (props.$media && !props.$overlay ? 'padding: 2px 8px 4px;' : '')}
  ${(props) =>
    props.$inline
      ? `
    margin-left: auto;
    align-self: last baseline;
    line-height: 1.2;
  `
      : ''}
  ${(props) =>
    props.$overlay
      ? `
    position: absolute;
    z-index: 2;
    ${props.$own ? 'left' : 'right'}: ${MEDIA_BUBBLE_INSET_PX + MEDIA_TIME_PILL_OFFSET_PX - (props.$bordered ? 1 : 0)}px;
    bottom: ${MEDIA_BUBBLE_INSET_PX + MEDIA_TIME_PILL_OFFSET_PX - (props.$bordered ? 1 : 0)}px;
    align-self: auto;
    padding: 2px 7px;
    border-radius: 999px;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    font-size: 11px;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  `
      : ''}
`;

export const CustomMessagePhoto = styled.img`
  width: 40px;
  aspect-ratio: 1/1;
  display: block;
  margin-left: auto;
  margin-right: auto;
  border-radius: var(--ethora-radius-full, 999px);

  transition: box-shadow var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));

  &:hover {
    box-shadow: var(--ethora-shadow-sm, 0 1px 2px rgba(16, 24, 40, 0.06));
  }
`;

export const CustomMessagePhotoContainer = styled.div`
  cursor: pointer;
  margin: 0;
`;

export const CustomSystemMessage = styled.div`
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 8px 0;
  box-sizing: border-box;
  padding: 0 8px;
  background-color: transparent;
  gap: 16px;
`;

export const CustomSystemMessageText = styled.p`
  margin: 0;
  color: #000000;
  [data-ethora-color-scheme='dark'] & {
    color: var(--ethora-color-text);
  }
  margin: 10px;
  white-space: nowrap;
`;

export const IconButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: gray;
  [data-ethora-color-scheme='dark'] & {
    color: var(--ethora-color-text-muted);
  }
  font-size: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
`;

export const MessageFooter = styled.div<{ $isUser: boolean }>`
  display: flex;
  justify-content: flex-start;
  position: absolute;
  gap: 6px;
  bottom: -25px;
  left: ${(props) => !props.$isUser && '50px'};
  right: ${(props) => props.$isUser && '10px'};
  ${fadeInAnimation}

  @media (max-width: 675px) {
    font-size: 12px;
    bottom: -24px;
  }
`;

export const Line = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: transparent;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
`;

export const StyledLoaderWrapper = styled.div`
  height: 100%;
  display: flex;
  justify-content: center;
`;

export const OrDelimiter = styled.div`
  text-align: center;
  position: relative;
  width: 100%;
  font-size: 14px;
  color: #999;
  [data-ethora-color-scheme='dark'] & {
    color: var(--ethora-color-text-muted);
  }

  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 45%;
    height: 1px;
    background: #ccc;
  }

  [data-ethora-color-scheme='dark'] &::before,
  [data-ethora-color-scheme='dark'] &::after {
    background: var(--ethora-color-border);
  }

  &::before {
    left: 0;
  }

  &::after {
    right: 0;
  }
`;

export const AlsoContainer = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  background-color: #0052cd0d;
  font-size: 14px;
  padding: 10px 28px;
  text-align: start;
`;

export const AlsoCheckbox = styled.input<{ $accentColor: string }>`
  width: 16px;
  height: 16px;
  border-radius: #0052cd;
  accent-color: #5e3fde;
  accent-color: ${(props) => props.$accentColor};
`;

export const Wrapper = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'isClickable' && prop !== 'bgColor',
})<{
  bgColor: string;
  size?: number;
  isClickable: boolean;
}>`
  width: ${({ size }) => (size ? `${size}px` : '64px')};
  height: ${({ size }) => (size ? `${size}px` : '64px')};
  border-radius: 50%;
  background-color: ${({ bgColor }) => bgColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  cursor: ${({ isClickable }) => (isClickable ? 'pointer' : 'default')};
  position: relative;
`;

export const AvatarCircle = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'isClickable' && prop !== 'bgColor',
})<{
  bgColor: string;
  size?: number;
  isClickable: boolean;
}>`
  width: ${({ size }) => (size ? `${size}px` : '64px')};
  height: ${({ size }) => (size ? `${size}px` : '64px')};
  border-radius: 50%;
  background-color: ${({ bgColor }) => bgColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  cursor: ${({ isClickable }) => (isClickable ? 'pointer' : 'default')};
  overflow: hidden;
  /* Initials sit on a light pastel (hashcolor), so they stay dark in the
     dark scheme instead of inheriting the light text colour. */
  [data-ethora-color-scheme='dark'] & {
    color: #141414;
  }

  line-height: 16px;
`;

export const AvatarImage = styled.img<{ size?: number }>`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

export const RemoveButton = styled.button`
  position: absolute;
  top: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 0;
  padding: 0;
`;

export const FileInput = styled.input`
  display: none;
`;

export const Overlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  border-radius: 50%;
  &:hover {
    background-color: rgba(0, 0, 0, 0.7);
  }
`;

export const ScrollToBottomButton = styled.button<{ color?: string }>`
  position: absolute;
  bottom: 20px;
  right: 20px;
  color: white;
  border: none;
  border-radius: var(--ethora-radius-full, 999px);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
  transition: transform var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));
  z-index: 1000;
  background-color: ${({ color }) => color || 'var(--ethora-color-bg, #fff)'};
  ${scaleInAnimation}

  &:hover {
    transform: scale(1.1);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }

  .count {
    position: absolute;
    top: -8px;
    right: -8px;
    background-color: var(--ethora-color-danger, #ff4444);
    color: white;
    border-radius: var(--ethora-radius-full, 999px);
    width: 20px;
    height: 20px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

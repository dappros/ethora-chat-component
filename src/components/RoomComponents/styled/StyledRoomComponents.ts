import React from 'react';
import styled from 'styled-components';

// The last-message preview is a compact TWO-LINE block: the sender on the
// first line, the message itself on the second. Both lines are single-line
// and truncate on their own with an ellipsis, so a long sender can never eat
// the message and a long message can never wrap. The block has a fixed
// min-height (two 16px lines plus the 2px gap) so rows with and without a
// sender line keep the same height; a row with no sender simply centres its
// one line inside that height. A media thumbnail row is taller (28px line)
// and is the only case that grows past it.
export const PREVIEW_NAME_PX = 16;
export const PREVIEW_LINE_PX = 18;
export const PREVIEW_BLOCK_MIN_PX = PREVIEW_NAME_PX + 2 + PREVIEW_LINE_PX;

export const LastRoomMessageContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
  /* Fixed, not min: every kind of last message (text, emoji, thumbnail,
     deleted, no sender) reserves exactly the same two lines. */
  height: ${PREVIEW_BLOCK_MIN_PX}px;
  line-height: 1.25;
  text-align: start;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

// Line 1: sender (first + last name, "You" for own messages).
export const LastRoomMessageName = styled.div`
  font-size: 12.5px;
  font-weight: 600;
  line-height: ${PREVIEW_NAME_PX}px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

// Line 2: the message (also used on its own, e.g. "Room created").
export const LastRoomMessageText = styled.span`
  display: block;
  min-width: 0;
  font-size: 13px;
  font-weight: 400;
  line-height: ${PREVIEW_LINE_PX}px;
  text-align: start;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ethora-color-text-muted, #6b7280);

  /* Unread rows: the message line turns bold and full-strength. */
  [data-unread='true'] & {
    font-weight: 600;
    color: var(--ethora-color-text, #141414);
  }
`;

/** Line 2 when it carries an icon or thumbnail next to its label. */
export const LastRoomMessageLine = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  height: ${PREVIEW_LINE_PX}px;
  color: var(--ethora-color-text-muted, #6b7280);

  > ${LastRoomMessageText} {
    flex: 1 1 auto;
  }
`;

/** Thumbnail/icon + label for a media preview, on the message line. */
export const LastRoomMessageMedia = styled(LastRoomMessageLine)``;

// Unread-count pill. Always solid `primary` + on-primary text regardless of
// the row's active state, since the row background is now a soft tint
// rather than a solid fill (see styled/RoomListComponents ChatItem).
export const NewMessageMarker = styled.div`
  border-radius: var(--ethora-radius-full, 999px);
  padding: 2px 7px;
  font-weight: 600;
  min-width: 20px;
  height: 20px;
  box-sizing: border-box;
  font-size: var(--ethora-font-size-xs, 12px);
  display: flex;
  justify-content: center;
  align-items: center;
  margin-left: auto;
  background-color: var(--ethora-color-primary, #0052cd);
  color: var(--ethora-color-text-on-primary, #fff);
`;

export const LastMessageImg = styled.img`
  width: 20px;
  height: 20px;
  object-fit: cover;
  pointer-events: none;
`;

export const ShadeWrapper = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1;
`;

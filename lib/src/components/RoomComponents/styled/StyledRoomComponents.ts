import React from 'react';
import styled from 'styled-components';

// ONE line, always. The sender used to be a block of its own above the
// text, so a room whose last message had a named sender was three lines
// tall and a room showing "Room created" (or a message from an anonymous
// sender) was two - the list was a staircase of tile heights.
//
// It is one flowing line of inline text, truncated ONCE at the end:
// "Sender: text of the message...". Laying the sender and the text out as
// two flex items instead made each of them shrink on its own, so a long
// message squeezed the sender down to a single letter ("S", "Et...").
export const LastRoomMessageContainer = styled.div`
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  height: 20px;
  line-height: 20px;
  text-align: start;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

export const LastRoomMessageName = styled.span`
  font-weight: var(--ethora-font-weight-medium, 500);
  color: var(--ethora-color-text, #141414);

  &::after {
    content: ':';
    margin-inline-end: 4px;
  }
`;

// Inline inside the container above; blockified (and truncating on its
// own) when a row uses it directly as a flex item, e.g. "Room created".
export const LastRoomMessageText = styled.span`
  min-width: 0;
  text-align: start;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

/** Thumbnail/icon + label for a media preview, flowing in the same line. */
export const LastRoomMessageMedia = styled.span`
  > :first-child {
    display: inline-block;
    vertical-align: -5px;
    margin-inline-end: 4px;
  }
`;

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

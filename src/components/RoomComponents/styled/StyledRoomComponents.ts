import React from 'react';
import styled from 'styled-components';

export const LastRoomMessageContainer = styled.div`
  display: flex;
  width: 80%;
  max-width: 190px;
  flex-direction: column;
  align-items: flex-start;
`;

export const LastRoomMessageName = styled.div`
  height: 20px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 190px;
`;

export const LastRoomMessageText = styled.div`
  height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 190px;
  color: var(--ethora-color-text-secondary, #5a5f66);
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

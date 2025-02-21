import React from 'react';
import styled from 'styled-components';

export const LastRoomMessageContainer = styled.div`
  display: flex;
  width: 80%;
  flex-direction: column;
  align-items: flex-start;
`;

export const LastRoomMessageName = styled.div`
  height: 20px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
`;

export const LastRoomMessageText = styled.div`
  height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
`;

export const NewMessageMarker = styled.div`
  border-radius: 8px;
  padding: 2px 2px;
  font-weight: 600;
  min-width: 24px;
  min-height: 24px;
  font-size: 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-left: auto;
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

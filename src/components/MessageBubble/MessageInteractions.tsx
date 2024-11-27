import React, { useState } from 'react';
import {
  ContextMenu,
  Delimeter,
  MenuItem,
  Overlay,
} from '../ContextMenu/ContextMenuComponents';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import {
  MESSAGE_INTERACTIONS,
  MESSAGE_INTERACTIONS_ICONS,
} from '../../helpers/constants/MESSAGE_INTERACTIONS';
import { IMessage } from '../../types/types';
import { useXmppClient } from '../../context/xmppProvider';
import { setActiveMessage } from '../../roomStore/roomsSlice';

interface MessageInteractionsProps {
  message: IMessage;
  contextMenu: { visible: boolean; x: number; y: number };
  setContextMenu: ({ visible, x, y }) => void;
  handleReplyMessage: () => void;
  handleDeleteMessage: () => void;
}

const MessageInteractions: React.FC<MessageInteractionsProps> = ({
  message,
  contextMenu,
  setContextMenu,
  handleReplyMessage: replyMessage,
  handleDeleteMessage,
}) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  // const handleDeleteMessage = (roomJid: string, messageId: string) => {
  //   // dispatch(deleteRoomMessage({ roomJID: room, messageId: msgId }));
  //   client.deleteMessageStanza(roomJid, messageId);
  // };

  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const closeContextMenu = () => {
    if (!config?.disableInteractions) {
      setContextMenu({ visible: false, x: 0, y: 0 });
    }
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleReplyMessage = () => {
    replyMessage();
  }

  if (config?.disableInteractions || !contextMenu.visible) return null;

  return (
    <Overlay onClick={closeContextMenu}>
      <ContextMenu
        style={{ top: contextMenu.y, left: contextMenu.x }}
        onClick={closeContextMenu}
      >
        {/* <MenuItem onClick={() => console.log(MESSAGE_INTERACTIONS.SEND_COINS)}>
          {MESSAGE_INTERACTIONS.SEND_COINS}
          <MESSAGE_INTERACTIONS_ICONS.SEND_COINS />{' '}
        </MenuItem>
        <Delimeter />
        <MenuItem onClick={() => console.log(MESSAGE_INTERACTIONS.SEND_ITEM)}>
          {MESSAGE_INTERACTIONS.SEND_ITEM}
          <MESSAGE_INTERACTIONS_ICONS.SEND_ITEM />{' '}
        </MenuItem> */}
        {/* <Delimeter /> */}
        <MenuItem onClick={handleReplyMessage}>
          {MESSAGE_INTERACTIONS.REPLY}
          <MESSAGE_INTERACTIONS_ICONS.REPLY />{' '}
        </MenuItem>
        <Delimeter />
        <MenuItem onClick={() => handleCopyMessage(message.body)}>
          {MESSAGE_INTERACTIONS.COPY}
          <MESSAGE_INTERACTIONS_ICONS.COPY />
        </MenuItem>
        <Delimeter />
        <MenuItem onClick={handleDeleteMessage}>
          {MESSAGE_INTERACTIONS.DELETE}
          <MESSAGE_INTERACTIONS_ICONS.DELETE />{' '}
        </MenuItem>
        <Delimeter />
        <MenuItem onClick={() => console.log(MESSAGE_INTERACTIONS.REPORT)}>
          {MESSAGE_INTERACTIONS.REPORT}
          <MESSAGE_INTERACTIONS_ICONS.REPORT />{' '}
        </MenuItem>
      </ContextMenu>
    </Overlay>
  );
};

export default MessageInteractions;

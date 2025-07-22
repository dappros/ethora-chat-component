import { FC, useCallback } from 'react';
import { useXmppClient } from '../context/xmppProvider';
import { useDispatch, useSelector } from 'react-redux';
import { addRoomMessage } from '../roomStore/assistantMessageSlice';
import { RootState } from '../roomStore';
import { useChatSettingState } from './useChatSettingState';
import { AsisstantUserType } from '../types/types';

export const useSendMessage = () => {
  const { config } = useChatSettingState();
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  const sendMessage = useCallback(
    (
      message: string,
      activeRoomJID: string,
      user: AsisstantUserType,
      mainMessage?: string
    ) => {
      const id = `send-text-message-${Date.now().toString()}`;
      console.log(activeRoomJID);
      dispatch(
        addRoomMessage({
          roomJID: activeRoomJID,
          message: {
            id: id,
            user,
            date: new Date().toISOString(),
            body: message,
            roomJid: activeRoomJID,
            pending: true,
            xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
          },
        })
      );

      client?.sendMessage(activeRoomJID, message, mainMessage || '', id);
    },
    []
  );

  return {
    sendMessage,
  };
};

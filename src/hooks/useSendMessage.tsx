import { FC, useCallback } from 'react';
import { useXmppClient } from '../context/xmppProvider';
import { useDispatch, useSelector } from 'react-redux';
import { addRoomMessage, setEditAction } from '../roomStore/roomsSlice';
import { uploadFile } from '../networking/api-requests/auth.api';
import { RootState } from '../roomStore';
import { useChatSettingState } from './useChatSettingState';
import { addMessageToHeap } from '../roomStore/roomHeapSlice';
import { v4 as uuidv4 } from 'uuid';

export const useSendMessage = () => {
  const { config, langSource } = useChatSettingState();
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  const { user, editAction } = useSelector((state: RootState) => ({
    activeRoomJID: state.rooms.activeRoomJID,
    user: state.chatSettingStore.user,
    editAction: state.rooms.editAction,
    config: state.chatSettingStore.config,
  }));

  const sendMessage = useCallback(
    (
      message: string,
      activeRoomJID: string,
      isReply?: boolean,
      isChecked?: boolean,
      mainMessage?: string
    ) => {
      if (editAction.isEdit) {
        client?.editMessageStanza(
          editAction.roomJid,
          editAction.messageId,
          message
        );

        dispatch(setEditAction({ isEdit: false }));
        return;
      } else {
        if (config?.translates?.enabled) {
          if (!config?.disableSentLogic) {
            const id = `send-translate-message-${uuidv4()}`;
            dispatch(
              addRoomMessage({
                roomJID: activeRoomJID,
                message: {
                  user: {
                    ...user,
                    id: user.xmppUsername,
                    name: user.firstName + ' ' + user.lastName,
                  },
                  date: new Date().toISOString(),
                  body: message,
                  roomJid: activeRoomJID,
                  pending: config?.disableSentLogic ? false : true,
                  xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
                  id: id,
                },
              })
            );
          }

          client?.sendTextMessageWithTranslateTagStanza(
            activeRoomJID,
            user.firstName,
            user.lastName,
            '',
            user.walletAddress,
            message,
            '',
            isReply || false,
            isChecked || false,
            mainMessage || '',
            langSource || 'en'
          );
        } else {
          const id = `send-text-message-${uuidv4()}`;
          if (!config?.disableSentLogic) {
            dispatch(
              addRoomMessage({
                roomJID: activeRoomJID,
                message: {
                  id: id,
                  user: {
                    ...user,
                    id: user.xmppUsername,
                    name: user.firstName + ' ' + user.lastName,
                  },
                  date: new Date().toISOString(),
                  body: message,
                  roomJid: activeRoomJID,
                  xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
                },
              })
            );
            dispatch(
              addMessageToHeap({
                jid: id,
                message: {
                  id: id,
                  user: {
                    ...user,
                    id: user.xmppUsername,
                    name: user.firstName + ' ' + user.lastName,
                  },
                  date: new Date().toISOString(),
                  body: message,
                  roomJid: activeRoomJID,
                  xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
                },
              })
            );
          }

          client?.sendMessage(
            activeRoomJID,
            user.firstName,
            user.lastName,
            '',
            user.walletAddress,
            message,
            '',
            isReply || false,
            isChecked || false,
            mainMessage || '',
            id
          );
        }
      }
    },
    [editAction, config, user, client, dispatch, langSource]
  );

  const sendEditMessage = useCallback(
    (message: string) => {
      client?.editMessageStanza(
        editAction.roomJid,
        editAction.messageId,
        message
      );

      dispatch(setEditAction({ isEdit: false }));
      return;
    },
    [editAction, client, dispatch]
  );

  const sendMedia = useCallback(
    async (
      data: File,
      type: string,
      activeRoomJID: string,
      isReply = false,
      isChecked = false,
      mainMessage = ''
    ) => {
      const id = `send-media-message:${uuidv4()}`;
      if (!config?.disableSentLogic) {
        dispatch(
          addRoomMessage({
            roomJID: activeRoomJID,
            message: {
              id: id,
              body: 'media',
              roomJid: activeRoomJID,
              date: new Date().toISOString(),
              user: {
                ...user,
                id: user.xmppUsername,
                name: user.firstName + ' ' + user.lastName,
              },
              pending: true,
              isDeleted: false,
              xmppId: id,
              xmppFrom: `${activeRoomJID}/${user.id}`,
              isSystemMessage: 'false',
              isMediafile: 'true',
              fileName: data.name,
              location: '',
              locationPreview: '',
              mimetype: type,
              originalName: data.name,
              size: data.size.toString(),
              isReply,
              showInChannel: `${isChecked}`,
              mainMessage,
            },
          })
        );
      }

      const mediaData = new FormData();
      mediaData.append('files', data);

      try {
        const response = await uploadFile(mediaData);

        for (const item of response.data.results) {
          const messagePayload = {
            firstName: user.firstName,
            lastName: user.lastName,
            walletAddress: user.walletAddress,
            createdAt: item.createdAt,
            expiresAt: item.expiresAt,
            fileName: item.filename,
            isVisible: item?.isVisible,
            location: item.location,
            locationPreview: item.locationPreview,
            mimetype: item.mimetype,
            originalName: item?.originalname,
            ownerKey: item?.ownerKey,
            size: item.size,
            duration: item?.duration,
            updatedAt: item?.updatedAt,
            userId: item?.userId,
            attachmentId: item?._id,
            wrappable: true,
            roomJid: activeRoomJID,
            showInChannel: isChecked,
            isReply,
            mainMessage,
            isPrivate: item?.isPrivate,
            __v: item.__v,
          };

          client?.sendMediaMessageStanza(activeRoomJID, messagePayload, id);
        }
      } catch (error) {
        console.error('Upload failed:', error);
      }
    },
    [client, config, user]
  );

  return {
    sendMessage,
    sendMedia,
    sendEditMessage,
  };
};

import { FC, useCallback } from 'react';
import { useXmppClient } from '../context/xmppProvider';
import { useDispatch, useSelector } from 'react-redux';
import { addRoomMessage, setEditAction } from '../roomStore/roomsSlice';
import { uploadFile } from '../networking/api-requests/auth.api';
import { RootState } from '../roomStore';
import { useChatSettingState } from './useChatSettingState';
import { addMessageToHeap } from '../roomStore/roomHeapSlice';
import { v4 as uuidv4 } from 'uuid';
import { useEventHandlers } from './useEventHandlers';

export const useSendMessage = () => {
  const { config, langSource } = useChatSettingState();
  const { client } = useXmppClient();
  const dispatch = useDispatch();
  const { handleMessageSent, handleMessageFailed } = useEventHandlers(config);

  const { user, editAction, activeRoomJID, rooms } = useSelector(
    (state: RootState) => ({
      activeRoomJID: state.rooms.activeRoomJID,
      user: state.chatSettingStore.user,
      editAction: state.rooms.editAction,
      config: state.chatSettingStore.config,
      rooms: state.rooms.rooms,
    })
  );

  const isLastMessageFromUserAndProcessing = useCallback(
    (roomJID: string): boolean => {
      if (!config?.blockMessageSendingWhenProcessing) return false;

      const room = rooms[roomJID];
      if (!room || !room.messages || room.messages.length === 0) return false;

      const lastMessage = room.messages[room.messages.length - 1];
      return lastMessage.user.id === user.xmppUsername;
    },
    [config?.blockMessageSendingWhenProcessing, rooms, user.xmppUsername]
  );

  const sendMessage = useCallback(
    async (
      message: string,
      activeRoomJID: string,
      isReply?: boolean,
      isChecked?: boolean,
      mainMessage?: string
    ) => {
      if (isLastMessageFromUserAndProcessing(activeRoomJID)) {
        console.log('Cannot send message: Last message is still processing');
        return;
      }

      if (editAction.isEdit) {
        try {
          client?.editMessageStanza(
            editAction.roomJid,
            editAction.messageId,
            message
          );
          dispatch(setEditAction({ isEdit: false }));

          await handleMessageSent({
            message,
            roomJID: activeRoomJID,
            user,
            messageType: 'text',
            metadata: {
              isReply,
              isChecked,
              mainMessage,
              editAction,
            },
          });
        } catch (error) {
          console.error('Error editing message:', error);
          handleMessageFailed({
            message,
            roomJID: activeRoomJID,
            error: error as Error,
            messageType: 'text',
          });
        }
        return;
      } else {
        try {
          if (config?.translates?.enabled) {
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
                  pending: true,
                  xmppFrom: `${activeRoomJID}/${user.xmppUsername}`,
                  id: id,
                },
              })
            );

            dispatch(
              addMessageToHeap({
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
                isReply: isReply || false,
                showInChannel: (isChecked ? 'true' : 'false') as any,
                mainMessage: mainMessage || '',
                langSource: (langSource as any) || 'en',
              })
            );

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
              (langSource as any) || 'en',
              id
            );

            await handleMessageSent({
              message,
              roomJID: activeRoomJID,
              user,
              messageType: 'text',
              metadata: {
                isReply,
                isChecked,
                mainMessage,
                editAction,
                translateEnabled: true,
                messageId: id,
              },
            });
          } else {
            const id = `send-text-message-${uuidv4()}`;
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
                  pending: true,
                },
              })
            );
            dispatch(
              addMessageToHeap({
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
                isReply: isReply || false,
                showInChannel: (isChecked ? 'true' : 'false') as any,
                mainMessage: mainMessage || '',
              })
            );

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

            await handleMessageSent({
              message,
              roomJID: activeRoomJID,
              user,
              messageType: 'text',
              metadata: {
                isReply,
                isChecked,
                mainMessage,
                editAction,
                translateEnabled: false,
                messageId: id,
              },
            });
          }
        } catch (error) {
          console.error('Error sending message:', error);
          handleMessageFailed({
            message,
            roomJID: activeRoomJID,
            error: error as Error,
            messageType: 'text',
          });
        }
      }
    },
    [
      editAction,
      config,
      user,
      client,
      dispatch,
      langSource,
      isLastMessageFromUserAndProcessing,
    ]
  );

  const sendEditMessage = useCallback(
    async (message: string) => {
      try {
        client?.editMessageStanza(
          editAction.roomJid,
          editAction.messageId,
          message
        );

        dispatch(setEditAction({ isEdit: false }));

        await handleMessageSent({
          message,
          roomJID: editAction.roomJid,
          user,
          messageType: 'text',
          metadata: {
            isEdit: true,
            messageId: editAction.messageId,
          },
        });
      } catch (error) {
        console.error('Error editing message:', error);
        handleMessageFailed({
          message,
          roomJID: editAction.roomJid,
          error: error as Error,
          messageType: 'text',
        });
      }
      return;
    },
    [editAction, client, dispatch, user, handleMessageSent, handleMessageFailed]
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
      if (isLastMessageFromUserAndProcessing(activeRoomJID)) {
        console.log('Cannot send media: Last message is still processing');
        return;
      }

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

      try {
        const mediaData = new FormData();
        mediaData.append('files', data);

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

        await handleMessageSent({
          message: 'media',
          roomJID: activeRoomJID,
          user,
          messageType: 'media',
          metadata: {
            isReply,
            isChecked,
            mainMessage,
            fileData: data,
            fileType: type,
            messageId: id,
            uploadResults: response.data.results,
          },
        });
      } catch (error) {
        console.error('Upload failed:', error);
        handleMessageFailed({
          message: 'media',
          roomJID: activeRoomJID,
          error: error as Error,
          messageType: 'media',
        });
      }
    },
    [
      client,
      config,
      user,
      isLastMessageFromUserAndProcessing,
      handleMessageSent,
      handleMessageFailed,
    ]
  );

  return {
    sendMessage,
    sendMedia,
    sendEditMessage,
    isLastMessageFromUserAndProcessing,
  };
};

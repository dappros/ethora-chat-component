import { FC, useCallback } from "react";
import { useXmppClient } from "../context/xmppProvider";
import { useDispatch, useSelector } from "react-redux";
import { setEditAction } from "../roomStore/roomsSlice";
import { uploadFile } from "../networking/api-requests/auth.api";
import { RootState } from "../roomStore";

export const useSendMessage = () => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  const {
    user,
    activeRoomJID,
    editAction,
  } = useSelector((state: RootState) => ({
    activeRoomJID: state.rooms.activeRoomJID,
    user: state.chatSettingStore.user,
    editAction: state.rooms.editAction,
  }));
  
  const sendMessage = useCallback(
    (message: string) => {
      if (editAction.isEdit) {
        client?.editMessageStanza(
          editAction.roomJid,
          editAction.messageId,
          message
        );

        dispatch(setEditAction({ isEdit: false }));
        return;
      } else {
        client?.sendMessage(
          activeRoomJID,
          user.firstName,
          user.lastName,
          '',
          user.walletAddress,
          message
        );
      }

      // dispatch(
      //   addRoomMessage({
      //     roomJID: currentRoom.jid,
      //     message: {
      //       id: getHighResolutionTimestamp(),
      //       user: {
      //         ...user,
      //         id: user.walletAddress,
      //         name: user.firstName + " " + user.lastName,
      //       },
      //       date: new Date().toISOString(),
      //       body: message,
      //       roomJID: currentRoom.jid,
      //       // pending: true,
      //     },
      //   })
      // );
    },
    [activeRoomJID, editAction]
  );

  const sendMedia = useCallback(
    async (data: any, type: string) => {
      let mediaData: FormData | null = new FormData();
      mediaData.append('files', data);

      uploadFile(mediaData)
        .then((response) => {
          console.log('Upload successful', response);
          response.data.results.map(async (item: any) => {
            const data = {
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
              isPrivate: item?.isPrivate,
              __v: item.__v,
            };
            console.log(data, 'data to send media');
            client?.sendMediaMessageStanza(activeRoomJID, data);
          });
        })
        .catch((error) => {
          console.error('Upload failed', error);
        });
    },
    [client, activeRoomJID]
  );

  return {
    sendMessage,
    sendMedia
  }
}
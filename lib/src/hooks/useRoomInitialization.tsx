import { useEffect } from 'react';
import { setIsLoading } from '../roomStore/roomsSlice';
import { useXmppClient } from '../context/xmppProvider';
import { IConfig, IMessage, IRoom } from '../types/types';
import { useDispatch } from 'react-redux';
import useGetNewArchRoom from './useGetNewArchRoom';

const countUndefinedText = (arr: IMessage[]) =>
  arr.filter((item) => item?.body === undefined)?.length;

const PUSH_MESSAGE_ID_KEY = '@ethora/chat-component-pushMessageId';
const PUSH_ROOM_JID_KEY = '@ethora/chat-component-pushRoomJid';

const scrollToMessage = (messageId: string) => {
  const messageElement = document.querySelector(
    `[data-message-id="${messageId}"]`
  );
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    messageElement.classList.add('message-highlight');
    setTimeout(() => messageElement.classList.remove('message-highlight'), 2000);
  }
};

export const useRoomInitialization = (
  activeRoomJID: string,
  roomsList: Record<string, IRoom>,
  config: IConfig,
  messageLength: number
) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  const syncRooms = useGetNewArchRoom();

  useEffect(() => {
    if (client && activeRoomJID) {
      // Try fast explicit join for active room right after selection/login.
      client
        .presenceInRoomStanza(activeRoomJID, 0, 1200, true)
        .catch(() => {
          client.prioritizeRoomPresence(activeRoomJID).catch(() => {});
        });
    }
  }, [client, activeRoomJID]);

  useEffect(() => {
    const getDefaultHistory = async () => {
      if (!client) return;
      if (!activeRoomJID) return;
      await client.presenceInRoomStanza(activeRoomJID, 0, 1500, true).catch(() => {});
      dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
      const res = await client.getHistoryStanza(activeRoomJID, 30);
      if (res && countUndefinedText(res) > 0) {
        dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
        // make it more optimized
        await client.getHistoryStanza(
          activeRoomJID,
          20 + countUndefinedText(res),
          Number(res[0].id)
        );
      }
      dispatch(
        setIsLoading({
          loading: false,
          chatJID: activeRoomJID,
          loadingText: undefined,
        })
      );
    };

    const initialPresenceAndHistory = async () => {
      if (!roomsList[activeRoomJID] && activeRoomJID && client) {
        await client.presenceInRoomStanza(activeRoomJID);
        if (config?.newArch === false) {
          await client.getRoomsStanza();
        } else {
          await syncRooms(client, config);
        }
        await getDefaultHistory();
      } else {
        await getDefaultHistory();
      }
    };

    if (Object.keys(roomsList)?.length > 0) {
      if (
        activeRoomJID &&
        !roomsList?.[activeRoomJID] &&
        Object.keys(roomsList).length > 0
      ) {
        dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
        initialPresenceAndHistory();
      } else if (
        activeRoomJID &&
        messageLength < 1
      ) {
        dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
        getDefaultHistory();
      } else {
        dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
      }
    } else if (!roomsList?.[activeRoomJID]) {
      initialPresenceAndHistory();
    }

    if (client && activeRoomJID && typeof window !== 'undefined') {
      const pendingMessageId =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(PUSH_MESSAGE_ID_KEY)
          : null;
      const pendingRoomJID =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(PUSH_ROOM_JID_KEY)
          : null;

      if (pendingMessageId && (!pendingRoomJID || pendingRoomJID === activeRoomJID)) {
        client
          .getHistoryStanza(activeRoomJID, 30)
          .catch(() => {})
          .finally(() => {
            setTimeout(() => scrollToMessage(pendingMessageId), 200);
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem(PUSH_MESSAGE_ID_KEY);
              localStorage.removeItem(PUSH_ROOM_JID_KEY);
            }
          });
      }
    }

    if (client && config?.defaultRooms) {
      const allExist = config?.defaultRooms.every(
        (room) => roomsList[room.jid] !== undefined
      );
      if (roomsList && !allExist) {
        config?.defaultRooms.map(async (room) => {
          client.presenceInRoomStanza(room.jid);
        });
        if (config?.newArch === false) {
          client.getRoomsStanza();
        } else {
          // syncRooms(client, config);
        }
      }
    }
  }, [activeRoomJID, Object.keys(roomsList).length, messageLength]);
};

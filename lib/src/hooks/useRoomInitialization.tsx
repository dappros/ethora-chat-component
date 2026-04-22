import { useEffect } from 'react';
import { setIsLoading } from '../roomStore/roomsSlice';
import { useXmppClient } from '../context/xmppProvider';
import { IConfig, IMessage, IRoom } from '../types/types';
import { useDispatch } from 'react-redux';
import useGetNewArchRoom from './useGetNewArchRoom';

const countUndefinedText = (arr: IMessage[]) =>
  (Array.isArray(arr) ? arr : []).filter((item) => item?.body === undefined)
    ?.length;
const hasLoadedRoomHistory = (room?: IRoom): boolean => {
  const messages = Array.isArray(room?.messages) ? room.messages : [];
  if (!messages.length) return false;
  return messages.some(
    (message) =>
      message?.id !== 'delimiter-new' &&
      message?.pending !== true &&
      !!String(message?.body || '').trim()
  );
};

const PUSH_MESSAGE_ID_KEY = '@ethora/chat-component-pushMessageId';
const PUSH_ROOM_JID_KEY = '@ethora/chat-component-pushRoomJid';
const ACTIVE_ROOM_PRESENCE_TIMEOUT_MS = 1200;
const ACTIVE_ROOM_FAST_PRESENCE_TIMEOUT_MS = 3000;
const ACTIVE_ROOM_LOADER_HARD_CAP_MS = 3000;

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
      client.setActiveRoomJid(activeRoomJID);
      client.promoteRoomHistory(activeRoomJID);
      // Try fast explicit join for active room right after selection/login.
      client
        .presenceInRoomStanza(
          activeRoomJID,
          0,
          ACTIVE_ROOM_FAST_PRESENCE_TIMEOUT_MS,
          true
        )
        .catch(() => {
          client.prioritizeRoomPresence(activeRoomJID).catch(() => {});
        });
    }
    if (client && !activeRoomJID) {
      client.setActiveRoomJid(null);
    }
  }, [client, activeRoomJID]);

  useEffect(() => {
    const activeRoom = roomsList?.[activeRoomJID];
    const shouldLoadActiveHistory =
      !!activeRoomJID && !hasLoadedRoomHistory(activeRoom);

    const getDefaultHistory = async () => {
      if (!client) return;
      if (!activeRoomJID) return;
      const joined = await client
        .presenceInRoomStanza(activeRoomJID, 0, ACTIVE_ROOM_PRESENCE_TIMEOUT_MS, true)
        .catch(() => false);
      if (!joined) {
        client.prioritizeRoomPresence(activeRoomJID).catch(() => {});
      }
      dispatch(setIsLoading({ loading: true, chatJID: activeRoomJID }));
      let forceHidden = false;
      const hardCapTimer = setTimeout(() => {
        forceHidden = true;
        dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
      }, ACTIVE_ROOM_LOADER_HARD_CAP_MS);

      try {
        const res = await client.getHistoryStanza(
          activeRoomJID,
          30,
          undefined,
          undefined,
          { source: 'active' }
        );
        if (!res?.length) {
          client.prioritizeRoomPresence(activeRoomJID).catch(() => {});
        }
        if (res && countUndefinedText(res) > 0) {
          dispatch(setIsLoading({ loading: false, chatJID: activeRoomJID }));
          await client.getHistoryStanza(
            activeRoomJID,
            20 + countUndefinedText(res),
            Number(res[0].id),
            undefined,
            { source: 'active' }
          );
        }
      } finally {
        clearTimeout(hardCapTimer);
        if (!forceHidden) {
          dispatch(
            setIsLoading({
              loading: false,
              chatJID: activeRoomJID,
              loadingText: undefined,
            })
          );
        }
      }
    };

    const initialPresenceAndHistory = async () => {
      if (!roomsList[activeRoomJID] && activeRoomJID && client) {
        client
          .presenceInRoomStanza(activeRoomJID, 0, ACTIVE_ROOM_PRESENCE_TIMEOUT_MS, false)
          .catch(() => {});
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
        shouldLoadActiveHistory
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
          .getHistoryStanza(activeRoomJID, 30, undefined, undefined, {
            source: 'active',
          })
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

    const defaultRooms = Array.isArray(config?.defaultRooms)
      ? config.defaultRooms
      : [];
    if (client && defaultRooms.length) {
      const allExist = defaultRooms.every(
        (room) => roomsList[room.jid] !== undefined
      );
      if (roomsList && !allExist) {
        defaultRooms.forEach((room) => {
          client.presenceInRoomStanza(room.jid, 0, 1200, false);
        });
        if (config?.newArch === false) {
          client.getRoomsStanza();
        } else {
          // syncRooms(client, config);
        }
      }
    }
  }, [
    activeRoomJID,
    Object.keys(roomsList).length,
    messageLength,
    roomsList?.[activeRoomJID]?.messages?.length,
  ]);
};

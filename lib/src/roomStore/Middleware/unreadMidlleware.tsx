import { Middleware } from '@reduxjs/toolkit';
import { updateRoom } from '../roomsSlice';
import { IMessage } from '../../types/types';

const TRACKED_ACTIONS = new Set([
  'roomMessages/addRoomMessage',
  'roomMessages/setRoomMessages',
  'roomMessages/deleteRoomMessage',
  'roomMessages/setLastViewedTimestamp',
  'roomMessages/setCurrentRoom',
  'roomMessages/applyRoomsPreloadBatch',
]);

const isCountableMessage = (msg: IMessage): boolean =>
  !!msg && msg.id !== 'delimiter-new' && !msg.pending;

const toLocal = (value?: string): string => {
  if (!value) return '';
  return String(value).split('@')[0];
};

const getMessageTimestamp = (message: IMessage): number => {
  const dateTs = new Date(message?.date as string).getTime();
  if (Number.isFinite(dateTs) && dateTs > 0) return dateTs;

  const numericId = Number(message?.id);
  if (Number.isFinite(numericId) && numericId > 0) return numericId;

  const inlineTimestamp = Number((message as any)?.timestamp);
  if (Number.isFinite(inlineTimestamp) && inlineTimestamp > 0) {
    return inlineTimestamp;
  }

  return 0;
};

const computeUnreadForRoom = (
  room: any,
  activeChatJID: string | null,
  roomJid: string,
  currentXmppUsername: string
): { unread: number; unreadCapped: boolean } => {
  if (!room) {
    return { unread: 0, unreadCapped: false };
  }

  if (roomJid === activeChatJID) {
    return { unread: 0, unreadCapped: false };
  }

  const lastViewed = Number(room.lastViewedTimestamp || 0);

  const countableMessages = (room.messages || []).filter((msg: IMessage) => {
    if (!isCountableMessage(msg)) return false;

    const isOwnMessage =
      toLocal(msg?.user?.id) !== '' &&
      toLocal(msg?.user?.id) === toLocal(currentXmppUsername);

    if (isOwnMessage) return false;

    const ts = getMessageTimestamp(msg);
    if (ts <= 0) return false;

    if (lastViewed <= 0) return true;
    return ts > lastViewed;
  });

  let unreadCapped = false;
  if (room.historyPreloadState === 'done' && room.historyComplete !== true) {
    const oldestLoadedTs = countableMessages.reduce(
      (minTs: number, msg: IMessage) => {
        const ts = getMessageTimestamp(msg);
        if (!Number.isFinite(ts) || ts <= 0) return minTs;
        return Math.min(minTs, ts);
      },
      Number.MAX_SAFE_INTEGER
    );

    if (
      countableMessages.length >= 10 &&
      (lastViewed <= 0 ||
        (Number.isFinite(oldestLoadedTs) && oldestLoadedTs > lastViewed))
    ) {
      unreadCapped = true;
    }
  }

  return {
    unread: countableMessages.length,
    unreadCapped,
  };
};

const resolveTouchedRooms = (
  action: any,
  prevState: any,
  nextState: any
): Set<string> => {
  const touched = new Set<string>();

  if (!action?.type) return touched;

  switch (action.type) {
    case 'roomMessages/addRoomMessage':
    case 'roomMessages/setRoomMessages':
    case 'roomMessages/deleteRoomMessage': {
      const roomJID = action?.payload?.roomJID;
      if (roomJID) touched.add(roomJID);
      break;
    }
    case 'roomMessages/setLastViewedTimestamp': {
      const chatJID = action?.payload?.chatJID;
      if (chatJID) touched.add(chatJID);
      break;
    }
    case 'roomMessages/applyRoomsPreloadBatch': {
      const updates = action?.payload?.rooms || [];
      updates.forEach((roomUpdate: { jid?: string }) => {
        if (roomUpdate?.jid) touched.add(roomUpdate.jid);
      });
      break;
    }
    case 'roomMessages/setCurrentRoom': {
      const prevActive = prevState.rooms.activeRoomJID;
      const nextActive = nextState.rooms.activeRoomJID;
      if (prevActive) touched.add(prevActive);
      if (nextActive) touched.add(nextActive);
      break;
    }
    default:
      break;
  }

  return touched;
};

export const unreadMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (!action || !action.type) {
      return next(action);
    }

    if (action.type === 'roomMessages/updateRoom') {
      const updates = action.payload?.updates || {};
      const onlyUnreadFields =
        Object.keys(updates).length > 0 &&
        Object.keys(updates).every(
          (key) =>
            key === 'unreadMessages' ||
            key === 'unreadCapped' ||
            key === 'historyPreloadState'
        );
      if (onlyUnreadFields) {
        return next(action);
      }
    }

    if (!TRACKED_ACTIONS.has(action.type)) {
      return next(action);
    }

    const prevState = storeAPI.getState();
    const result = next(action);
    const nextState = storeAPI.getState();

    const rooms = nextState.rooms.rooms;
    const activeChatJID = nextState.rooms.activeRoomJID;
    const currentXmppUsername = nextState.chatSettingStore?.user?.xmppUsername;

    if (!rooms || Object.keys(rooms).length === 0) return result;

    const touchedRooms = resolveTouchedRooms(action, prevState, nextState);
    if (touchedRooms.size === 0) return result;

    touchedRooms.forEach((jid) => {
      const room = rooms[jid];
      if (!room) return;

      const { unread, unreadCapped } = computeUnreadForRoom(
        room,
        activeChatJID,
        jid,
        currentXmppUsername
      );

      if (
        (room.unreadMessages || 0) !== unread ||
        Boolean(room.unreadCapped) !== unreadCapped
      ) {
        storeAPI.dispatch(
          updateRoom({
            jid,
            updates: {
              unreadMessages: unread,
              unreadCapped,
            },
          })
        );
      }
    });

    return result;
  };

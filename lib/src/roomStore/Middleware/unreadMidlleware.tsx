import { Middleware } from '@reduxjs/toolkit';
import { updateRoom } from '../roomsSlice';
import { IMessage } from '../../types/types';

const TRACKED_ACTION_PREFIXES = ['roomMessages/'];

const shouldRecalculateUnread = (actionType: string): boolean =>
  TRACKED_ACTION_PREFIXES.some((prefix) => actionType.startsWith(prefix));

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

const isCountableMessage = (msg: IMessage): boolean =>
  !!msg && msg.id !== 'delimiter-new' && !msg.pending;

export const unreadMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (!action || !action.type) {
      console.error('Invalid action in unreadMiddleware:', action);
      return next(action);
    }

    if (!shouldRecalculateUnread(action.type)) {
      return next(action);
    }

    const result = next(action);

    const state = storeAPI.getState();
    const rooms = state.rooms.rooms;
    const activeChatJID = state.rooms.activeRoomJID;

    if (!rooms || Object.keys(rooms).length === 0) return result;

    Object.keys(rooms).forEach((jid) => {
      const room = rooms[jid];
      if (!room) return;

      const nextUnread =
        jid === activeChatJID
          ? 0
          : (room.messages || []).filter((msg: IMessage) => {
              if (!isCountableMessage(msg)) return false;
              const ts = getMessageTimestamp(msg);
              if (ts <= 0) return false;
              const lastViewed = Number(room.lastViewedTimestamp || 0);
              if (lastViewed <= 0) return true;
              return ts > lastViewed;
            }).length;

      if ((room.unreadMessages || 0) !== nextUnread) {
        storeAPI.dispatch(
          updateRoom({
            jid,
            updates: { unreadMessages: nextUnread },
          })
        );
      }
    });

    return result;
  };

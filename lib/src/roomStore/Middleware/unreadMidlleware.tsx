import { Middleware } from '@reduxjs/toolkit';
import { updateRoom } from '../roomsSlice';
import { IMessage } from '../../types/types';
import { getTimestampFromUnknown } from '../../helpers/timestamp';
import { isSameXmppUsername } from '../../helpers/xmppUsername';

const TRACKED_ACTIONS_PREFIX = 'roomMessages/';
const EXCLUDED_ACTIONS = new Set(['roomMessages/insertUsers']);

const isCountableMessage = (msg: IMessage): boolean =>
  !!msg &&
  msg.id !== 'delimiter-new' &&
  !msg.pending &&
  String((msg as any)?.isSystemMessage || '') !== 'true';

const getMessageTimestamp = (message: IMessage): number => {
  return (
    getTimestampFromUnknown(message?.date) ||
    getTimestampFromUnknown((message as any)?.timestamp) ||
    getTimestampFromUnknown(message?.id)
  );
};

const computeUnreadForRoom = (
  room: any,
  activeChatJID: string | null,
  roomJid: string,
  currentXmppUsername: string,
  isChatUiVisible: boolean
): { unread: number; unreadCapped: boolean } => {
  if (!room) {
    return { unread: 0, unreadCapped: false };
  }

  if (isChatUiVisible && roomJid === activeChatJID) {
    return { unread: 0, unreadCapped: false };
  }

  const lastViewed = getTimestampFromUnknown(room.lastViewedTimestamp);
  const baseline = getTimestampFromUnknown(room.unreadBaselineTimestamp);
  const cutoff = lastViewed > 0 ? lastViewed : baseline;

  const countableMessages = (room.messages || []).filter((msg: IMessage) => {
    if (!isCountableMessage(msg)) return false;

    const isOwnMessage = isSameXmppUsername(
      msg?.user?.id,
      currentXmppUsername
    );

    if (isOwnMessage) return false;

    const ts = getMessageTimestamp(msg);
    if (ts <= 0) return false;

    if (cutoff <= 0) return false;
    return ts > cutoff;
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
      cutoff > 0 &&
      Number.isFinite(oldestLoadedTs) &&
      oldestLoadedTs > cutoff
    ) {
      unreadCapped = true;
    }
  }

  return {
    unread: countableMessages.length,
    unreadCapped,
  };
};

// Exported for testing (verifies the O(N) vs O(N^2) room-bootstrap fix
// directly, without asserting on dispatched side effects that only fire when
// a computed value actually changes).
export const resolveTouchedRooms = (
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
    case 'roomMessages/updateRoom': {
      const jid = action?.payload?.jid;
      if (jid) touched.add(jid);
      break;
    }
    case 'roomMessages/replaceRoomMessages': {
      const roomJID = action?.payload?.roomJID;
      if (roomJID) touched.add(roomJID);
      break;
    }
    case 'roomMessages/addRoom': {
      const jid = action?.payload?.roomData?.jid;
      if (jid) touched.add(jid);
      break;
    }
    case 'roomMessages/addRoomFromApi': {
      // Fires once per room during initial room-list sync (see
      // useGetNewArchRoom.tsx). Touching only the added room (not every room
      // added so far) turns what used to be an O(N^2) unread recompute over
      // the whole account into O(N) — the previous "touch all rooms" here
      // meant room 1 recomputed 1 room, room 2 recomputed 2, ... room N
      // recomputed N, ~N^2/2 recomputes total for an N-room account.
      const jid = action?.payload?.room?.jid;
      if (jid) touched.add(jid);
      break;
    }
    // addRoomViaApi is a createAsyncThunk: dispatching it never fires the
    // bare 'roomMessages/addRoomViaApi' type, only the /pending, /fulfilled,
    // /rejected lifecycle actions (which don't mutate rooms.rooms at all —
    // the thunk's actual room write happens via the addRoomFromApi dispatch
    // above). Without these no-op cases they'd fall through to the generic
    // 'roomMessages/*' default below and touch every room for nothing.
    case 'roomMessages/addRoomViaApi/pending':
    case 'roomMessages/addRoomViaApi/fulfilled':
    case 'roomMessages/addRoomViaApi/rejected':
      break;
    case 'roomMessages/deleteRoom':
    case 'roomMessages/setLogoutState': {
      Object.keys(nextState?.rooms?.rooms || {}).forEach((jid) => touched.add(jid));
      Object.keys(prevState?.rooms?.rooms || {}).forEach((jid) => touched.add(jid));
      break;
    }
    default:
      if (String(action.type || '').startsWith(TRACKED_ACTIONS_PREFIX)) {
        Object.keys(nextState?.rooms?.rooms || {}).forEach((jid) => touched.add(jid));
      }
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

    const actionType = String(action.type || '');
    if (
      !actionType.startsWith(TRACKED_ACTIONS_PREFIX) ||
      EXCLUDED_ACTIONS.has(actionType)
    ) {
      return next(action);
    }

    const prevState = storeAPI.getState();
    const result = next(action);
    const nextState = storeAPI.getState();

    const rooms = nextState.rooms.rooms;
    const activeChatJID = nextState.rooms.activeRoomJID;
    const isChatUiVisible = nextState.rooms.isChatUiVisible ?? false;
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
        currentXmppUsername,
        isChatUiVisible
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

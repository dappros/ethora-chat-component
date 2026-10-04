import { Middleware } from '@reduxjs/toolkit';
import {
  clearJumpThread,
  getJumpThread,
  replyParentId,
  setJumpThread,
} from '../../helpers/jumpThread';
import { IMessage } from '../../types/types';

const find = (messages: IMessage[] | undefined, id: string) =>
  (messages ?? []).find((message) => String(message.id) === id);

/**
 * Keeps the thread panel's parent (helpers/jumpThread) in step with the
 * actions that open and close threads, without the room slice knowing about
 * jump windows:
 *  - closing a thread, leaving the room or logging out forgets it;
 *  - opening a thread on a message that exists only in a jump window (the
 *    live-list flag has nothing to flag) records that message and the replies
 *    seen with it, so the panel can open;
 *  - clearing the window while the panel shows a window-only parent: if the
 *    parent has meanwhile reached the live list, the ordinary flag takes over;
 *    otherwise the panel keeps the copy it already has.
 */
export const jumpThreadMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    const result = next(action);
    const type = action?.type;

    if (
      type === 'roomMessages/setCloseActiveMessage' ||
      type === 'roomMessages/setCurrentRoom' ||
      type === 'roomMessages/setLogoutState' ||
      type === 'chatSettingStore/logout'
    ) {
      clearJumpThread();
      return result;
    }

    if (type === 'roomMessages/setActiveMessage') {
      const { id, chatJID } = action.payload ?? {};
      const held = getJumpThread();
      // A thread this jump just opened and flagged: nothing to do.
      if (held && held.parentId === id && held.roomJID === chatJID) {
        return result;
      }
      clearJumpThread();
      const rooms = storeAPI.getState().rooms;
      if (find(rooms.rooms?.[chatJID]?.messages, id)) return result;
      const window = rooms.jumpWindow;
      const parent =
        window && window.roomJID === chatJID
          ? find(window.messages, id)
          : undefined;
      if (parent) {
        setJumpThread({
          roomJID: chatJID,
          parentId: id,
          at: null,
          parent,
          replies: window!.messages.filter(
            (message: IMessage) => replyParentId(message) === id
          ),
        });
      }
      return result;
    }

    if (type === 'roomMessages/clearJumpWindow') {
      const held = getJumpThread();
      if (!held?.parent) return result;
      const live = find(
        storeAPI.getState().rooms.rooms?.[held.roomJID]?.messages,
        held.parentId
      );
      if (live) {
        const { roomJID, parentId } = held;
        clearJumpThread();
        storeAPI.dispatch({
          type: 'roomMessages/setActiveMessage',
          payload: { id: parentId, chatJID: roomJID },
        });
      }
    }
    return result;
  };

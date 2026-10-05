import { Middleware } from '@reduxjs/toolkit';
import {
  clearJumpThread,
  findMessageIndex,
  getJumpThread,
  JUMP_TTL_MS,
  replyParentId,
  setJumpThread,
} from '../../helpers/jumpThread';
import { IMessage } from '../../types/types';

const find = (messages: IMessage[] | undefined, id: string) =>
  (messages ?? []).find((message) => String(message.id) === id);

const mergeUnique = (a: IMessage[], b: IMessage[]) => {
  const seen = new Set(a.map((message) => String(message.id)));
  return [...a, ...b.filter((message) => !seen.has(String(message.id)))];
};

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
 *  - a jump request while a thread panel is open: the panel replaces the main
 *    list, so no main-list instance exists to take the jump. Unless the target
 *    is a reply of the open parent (the thread's own list serves it), the
 *    thread is closed so the main list mounts; a reply of another parent is
 *    then resolved by the normal flow, which opens that parent's thread;
 *  - a request nobody owns is dropped shortly after its TTL, without the
 *    "archived" card when the message is in the live list.
 */
// Slack after the TTL so an owner that is merely polling finishes first.
const ORPHAN_GRACE_MS = 5000;

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

    if (type === 'roomMessages/requestJumpToMessage') {
      const state = storeAPI.getState().rooms;
      const jump = state.pendingJump;
      if (!jump) return result;
      const roomJID = jump.roomJID;
      const live: IMessage[] = state.rooms?.[roomJID]?.messages ?? [];
      const window = state.jumpWindow;
      const pool = mergeUnique(
        live,
        window && window.roomJID === roomJID ? window.messages : []
      );
      const open = pool.find((message) => message.activeMessage);
      if (open) {
        const content = { createdAt: jump.createdAt, body: jump.body };
        const index = findMessageIndex(pool, jump.ids, content);
        const sameParent =
          index >= 0 && replyParentId(pool[index]) === String(open.id);
        if (sameParent) {
          // The open thread serves this jump: make it the owner (a thread
          // opened by hand owns nothing, so the jump would stay pending).
          const held = getJumpThread();
          const base =
            held && held.parentId === String(open.id) ? held : null;
          setJumpThread({
            roomJID,
            parentId: String(open.id),
            at: jump.at,
            parent: base?.parent ?? null,
            replies: mergeUnique(base?.replies ?? [], [pool[index]]),
          });
        } else {
          storeAPI.dispatch({
            type: 'roomMessages/setCloseActiveMessage',
            payload: { chatJID: roomJID },
          });
        }
      }
      const at = jump.at;
      setTimeout(() => {
        const now = storeAPI.getState().rooms;
        const still = now.pendingJump;
        if (!still || still.at !== at) return;
        storeAPI.dispatch({ type: 'roomMessages/clearPendingJump' });
        const inLive =
          findMessageIndex(
            now.rooms?.[still.roomJID]?.messages ?? [],
            still.ids,
            { createdAt: still.createdAt, body: still.body }
          ) >= 0;
        if (!inLive && still.preview) {
          storeAPI.dispatch({
            type: 'roomMessages/showArchivedMessage',
            payload: still.preview,
          });
        }
      }, JUMP_TTL_MS + ORPHAN_GRACE_MS);
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

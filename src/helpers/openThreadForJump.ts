import type { AppDispatch } from '../roomStore';
import { setActiveMessage } from '../roomStore/roomsSlice';
import { IMessage } from '../types/types';
import {
  HistoryWindowClient,
  loadJumpWindow,
} from './jumpWindow';
import {
  mergeById,
  replyParentId,
  setJumpThread,
} from './jumpThread';

const isIn = (messages: IMessage[], id: string) =>
  messages.find(
    (message) => String(message.id) === id || String(message.xmppId) === id
  );

const repliesOf = (messages: IMessage[], parentId: string) =>
  messages.filter((message) => replyParentId(message) === parentId);

export interface OpenThreadForJumpParams {
  client?: HistoryWindowClient | null;
  dispatch: AppDispatch;
  roomJID: string;
  /** The pending request this opens a thread for. */
  at: number;
  /** The reply the jump named. */
  reply: IMessage;
  /** The room's live messages, unfiltered. */
  live: IMessage[];
  /** Messages found alongside the reply (a window), unfiltered. */
  nearby?: IMessage[];
}

/**
 * Opens the thread a reply belongs to, so a jump to the reply can highlight it
 * there. Resolves true when the thread is open (or about to be), false when
 * the parent could not be obtained.
 *
 * The parent comes from the live list (the usual thread flag), from the
 * messages found next to the reply, or, when it is in neither, from a window
 * around the parent fetched for the purpose.
 */
export async function openThreadForJump({
  client,
  dispatch,
  roomJID,
  at,
  reply,
  live,
  nearby = [],
}: OpenThreadForJumpParams): Promise<boolean> {
  const parentId = replyParentId(reply);
  if (!parentId) return false;

  const known = mergeById(live, nearby);
  const liveParent = isIn(live, parentId);
  if (liveParent) {
    setJumpThread({
      roomJID,
      parentId: String(liveParent.id),
      at,
      parent: null,
      replies: repliesOf(known, parentId).concat(reply),
    });
    dispatch(setActiveMessage({ id: String(liveParent.id), chatJID: roomJID }));
    return true;
  }

  let parent = isIn(nearby, parentId);
  let replies = repliesOf(known, parentId).concat(reply);

  if (!parent) {
    if (!client) return false;
    let result;
    try {
      result = await loadJumpWindow(client, roomJID, [parentId]);
    } catch {
      return false;
    }
    if (result.status !== 'found') return false;
    parent = isIn(result.window.messages, parentId);
    if (!parent) return false;
    replies = replies.concat(repliesOf(result.window.messages, parentId));
  }

  setJumpThread({
    roomJID,
    parentId: String(parent.id),
    at,
    parent,
    replies: mergeById(replies, []),
  });
  return true;
}

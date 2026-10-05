import { useSyncExternalStore } from 'react';
import { IMessage } from '../types/types';
import { parseMessageReference } from './parseMessageReference';
import { CONTENT_MATCH_WINDOW_MS } from './jumpWindow';

/** How long a jump request may stay pending before it is dropped. */
export const JUMP_TTL_MS = 60_000;

/**
 * Index of the message a jump names.
 *
 * By id first (message.id is the MAM stanza id for history, xmppId the client
 * message id). When the request has no id at all, which is common for archive
 * rows, by content: same text, sent within a few seconds of the same time.
 */
export const findMessageIndex = (
  messages: IMessage[],
  ids: string[],
  content?: { createdAt?: string; body?: string }
): number => {
  if (ids.length > 0) {
    const byId = messages.findIndex(
      (message) =>
        ids.includes(String(message.id)) ||
        (message.xmppId ? ids.includes(String(message.xmppId)) : false)
    );
    if (byId >= 0) return byId;
  }

  if (!content?.createdAt || !content.body) return -1;
  const wanted = new Date(content.createdAt).getTime();
  if (Number.isNaN(wanted)) return -1;
  const body = content.body.trim();
  return messages.findIndex((message) => {
    if (String(message.body ?? '').trim() !== body) return false;
    return (
      Math.abs(new Date(message.date).getTime() - wanted) <=
      CONTENT_MATCH_WINDOW_MS
    );
  });
};



/**
 * Where a jump to a thread REPLY lands, and the thread panel's parent message
 * when that message is not in the room's live list.
 *
 * Replies never appear in the main list (it hides them unless they are also
 * shown in the channel), so a jump to one has to open its parent's thread and
 * highlight the reply there. Two things have to be remembered for that:
 *  - which list owns the jump: `at` is the pending request this entry serves,
 *    `parentId` the thread that owns it. The main list stays inert for a jump
 *    that has an owner thread, and a thread list stays inert for any jump that
 *    is not its own (see useJumpToMessage);
 *  - the parent and the replies when they exist only in a jump window or came
 *    from a separate fetch: the thread panel reads them from here, so it does
 *    not depend on the window that found them still being on screen.
 *
 * Kept outside redux on purpose: the room slice's thread flag lives on
 * messages of the live list, which is exactly what these messages are not in.
 */
export interface JumpThreadState {
  roomJID: string;
  parentId: string;
  /** The pending request this entry serves; null for a thread opened by hand. */
  at: number | null;
  /** Set only when the parent is not in the room's live messages. */
  parent: IMessage | null;
  /** Replies known to belong to the thread beyond the live list. */
  replies: IMessage[];
}

let state: JumpThreadState | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const getJumpThread = (): JumpThreadState | null => state;

export const setJumpThread = (next: JumpThreadState | null): void => {
  state = next;
  emit();
};

export const clearJumpThread = (): void => {
  if (state === null) return;
  state = null;
  emit();
};

export const subscribeJumpThread = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useJumpThread = (): JumpThreadState | null =>
  useSyncExternalStore(subscribeJumpThread, getJumpThread, getJumpThread);

/** The thread that owns the jump `at`, or null when the main list does. */
export const ownerThreadFor = (
  thread: JumpThreadState | null,
  at: number | undefined
): string | null =>
  thread && at !== undefined && thread.at === at ? thread.parentId : null;

/**
 * The parent id of a message that is a thread reply and nothing else, or null:
 * a reply also shown in the channel is in the main list, so it needs no thread.
 */
export const replyParentId = (message: IMessage): string | null => {
  if (!message || String(message.isReply) !== 'true') return null;
  if (String(message.showInChannel) === 'true') return null;
  const id = parseMessageReference(message.mainMessage)?.id;
  return id ? String(id) : null;
};

/** `a` then `b`, one entry per message id, oldest first. */
export const mergeById = (a: IMessage[], b: IMessage[]): IMessage[] => {
  const seen = new Set<string>();
  const merged: IMessage[] = [];
  for (const message of [...a, ...b]) {
    const key = String(message.id);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(message);
  }
  const time = (message: IMessage) => {
    const value = new Date(message.date).getTime();
    return Number.isNaN(value) ? 0 : value;
  };
  return merged.sort((x, y) => time(x) - time(y));
};

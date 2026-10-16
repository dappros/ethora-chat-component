import type { IMessage } from '../types/types';
import { getTimestampFromId, getTimestampFromUnknown } from './timestamp';
import { isReservedName } from '../roomStore/safeKey';

/**
 * Per-room lookup tables for the delivery/read ticks, built once per
 * `room.messages` array (WeakMap keyed by the array reference) and shared by
 * every own bubble in that room. A bubble then costs O(viewers), not O(n).
 */
export interface ReceiptIndex {
  /** message id -> position in the loaded list. */
  indexById: Map<string, number>;
  /** message position -> timestamp in ms (0 when unknown). */
  tsByIndex: number[];
  /** author local part -> position of their newest loaded message. */
  lastAuthoredIndexByUser: Map<string, number>;
}

let buildCount = 0;
const cache = new WeakMap<readonly IMessage[], ReceiptIndex>();

const localPart = (value: string): string => {
  const at = value.indexOf('@');
  return at === -1 ? value : value.slice(0, at);
};

const messageTs = (message: IMessage): number =>
  getTimestampFromUnknown(message.date) ||
  getTimestampFromUnknown(message.timestamp) ||
  getTimestampFromId(message.id) ||
  0;

/** The lookup tables for `messages`, built on first use per array. */
export const getReceiptIndex = (
  messages: readonly IMessage[]
): ReceiptIndex => {
  const hit = cache.get(messages);
  if (hit) return hit;
  buildCount++;
  const indexById = new Map<string, number>();
  const tsByIndex: number[] = new Array(messages.length);
  const lastAuthoredIndexByUser = new Map<string, number>();
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.id !== undefined && !indexById.has(message.id)) {
      indexById.set(message.id, i);
    }
    tsByIndex[i] = messageTs(message);
    const author = message.user?.id;
    if (author) lastAuthoredIndexByUser.set(localPart(author), i);
  }
  const index: ReceiptIndex = { indexById, tsByIndex, lastAuthoredIndexByUser };
  cache.set(messages, index);
  return index;
};

/** Number of index builds so far (tests check one build per messages change). */
export const getReceiptIndexBuildCount = (): number => buildCount;

export interface ReceiptState {
  /** Other members who have read this message. */
  seenBy: string[];
  /** Other members who have received it (readers included). */
  deliveredBy: string[];
}

export const NO_RECEIPTS: ReceiptState = Object.freeze({
  seenBy: [],
  deliveredBy: [],
}) as ReceiptState;

export const receiptStateEqual = (a: ReceiptState, b: ReceiptState): boolean =>
  sameList(a.seenBy, b.seenBy) && sameList(a.deliveredBy, b.deliveredBy);

const sameList = (a: string[], b: string[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * True when watermark `id` covers the message at `pos` (timestamp `ts`):
 * same position or later in the loaded list. When `id` is not loaded, the
 * message time encoded in the id decides (later or equal covers).
 */
const watermarkCovers = (
  index: ReceiptIndex,
  id: string,
  pos: number,
  ts: number
): boolean => {
  const at = index.indexById.get(id);
  if (at !== undefined) return at >= pos;
  const watermarkTs = getTimestampFromId(id);
  return watermarkTs > 0 && ts > 0 && watermarkTs >= ts;
};

export interface ComputeReceiptsInput {
  index: ReceiptIndex;
  messageId: string;
  /** The bubble's own timestamp in ms (0 when unknown). */
  messageTs: number;
  /** Per-message receipts: xmppUsername -> ms (from message.receivedBy). */
  receivedBy?: Record<string, number>;
  /** Room delivery watermarks: xmppUsername -> stanza-id. */
  lastReceivedByUser?: Record<string, string>;
  /** Room read watermarks: xmppUsername -> stanza-id. */
  lastDisplayedByUser?: Record<string, string>;
  /** The current user's xmppUsername (never listed as a viewer). */
  selfId?: string;
}

/**
 * Who has read and who has received one of our messages. A viewer has read
 * it when their read watermark covers it, or when they have authored a
 * message at or after it (posting in the room implies they saw what came
 * before). A viewer has received it when a per-message receipt exists or
 * their delivery watermark covers it; reading implies receiving.
 */
export const computeReceiptState = ({
  index,
  messageId,
  messageTs,
  receivedBy,
  lastReceivedByUser,
  lastDisplayedByUser,
  selfId,
}: ComputeReceiptsInput): ReceiptState => {
  const pos = index.indexById.get(messageId);
  if (pos === undefined) return NO_RECEIPTS;
  const me = selfId ? localPart(selfId) : '';

  const candidates = new Set<string>();
  const add = (key: string) => {
    const user = localPart(key);
    // Reserved names exist on every plain object, so `receivedBy[user]`
    // would read an inherited member instead of a receipt.
    if (user && user !== me && !isReservedName(user)) candidates.add(user);
  };
  if (receivedBy) Object.keys(receivedBy).forEach(add);
  if (lastReceivedByUser) Object.keys(lastReceivedByUser).forEach(add);
  if (lastDisplayedByUser) Object.keys(lastDisplayedByUser).forEach(add);
  for (const author of index.lastAuthoredIndexByUser.keys()) add(author);

  const seenBy: string[] = [];
  const deliveredBy: string[] = [];
  for (const user of candidates) {
    const authoredAt = index.lastAuthoredIndexByUser.get(user);
    const readLater =
      (authoredAt !== undefined && authoredAt >= pos) ||
      (!!lastDisplayedByUser?.[user] &&
        watermarkCovers(index, lastDisplayedByUser[user], pos, messageTs));
    if (readLater) {
      seenBy.push(user);
      deliveredBy.push(user);
      continue;
    }
    const received =
      (receivedBy !== undefined && receivedBy[user] !== undefined) ||
      (!!lastReceivedByUser?.[user] &&
        watermarkCovers(index, lastReceivedByUser[user], pos, messageTs));
    if (received) deliveredBy.push(user);
  }
  if (seenBy.length === 0 && deliveredBy.length === 0) return NO_RECEIPTS;
  return { seenBy, deliveredBy };
};

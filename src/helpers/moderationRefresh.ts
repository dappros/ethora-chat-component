import type { IMessage } from '../types/types';
import { ModerationNotice, needsArchiveRefresh, noticeTargets } from './moderation';

/**
 * After a `restored` notice: re-read the restored messages from the archive
 * (MAM) so the original body and sender name show again. A hidden or deleted
 * message has lost its content on this client, so only the archive can bring
 * it back.
 *
 * Archive ids are microsecond timestamps, so the messages between the oldest
 * and the newest target are read with `after` windows. Bounded: at most
 * MAX_PAGES pages of PAGE_SIZE, and only messages already in the store are
 * replaced. Anything further away is refreshed by the next history load.
 */
export const PAGE_SIZE = 50;
export const MAX_PAGES = 4;

interface HistoryWindowClient {
  getHistoryWindow: (
    chatJID: string,
    max: number,
    cursor: { before?: number; after?: number }
  ) => Promise<{ ok: boolean; messages: IMessage[]; last: number | null; complete: boolean }>;
}

const archiveId = (message: IMessage): number | null => {
  const value = Number(message?.id);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** The stored messages a restore notice applies to that need the archive copy. */
export const restoreTargets = (
  messages: IMessage[] | undefined,
  notice: ModerationNotice
): IMessage[] =>
  (messages || []).filter(
    (message) =>
      noticeTargets(message, notice) &&
      (needsArchiveRefresh(message) || Boolean(message.senderMasked))
  );

export const fetchRestoredMessages = async (
  client: HistoryWindowClient | undefined | null,
  roomJID: string,
  targets: IMessage[]
): Promise<IMessage[]> => {
  if (!client?.getHistoryWindow || targets.length === 0) return [];
  const ids = targets.map(archiveId).filter((id): id is number => id !== null);
  if (ids.length === 0) return [];
  const wanted = new Set(targets.map((message) => String(message.id)));
  const newest = Math.max(...ids);
  let after = Math.min(...ids) - 1;
  const found: IMessage[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    let result: Awaited<ReturnType<HistoryWindowClient['getHistoryWindow']>>;
    try {
      result = await client.getHistoryWindow(roomJID, PAGE_SIZE, { after });
    } catch {
      break;
    }
    if (!result?.ok || !result.messages?.length) break;
    for (const message of result.messages) {
      if (wanted.has(String(message.id))) found.push(message);
    }
    const last = result.last ?? archiveId(result.messages[result.messages.length - 1]);
    if (result.complete || last === null || last >= newest || last <= after) break;
    after = last;
  }
  return found;
};

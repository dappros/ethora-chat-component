import XmppClient from '../networking/xmppClient';
import { store } from '../roomStore';

/**
 * How long to wait for the MUC to reflect our own message back before
 * assuming it never will. A MUC echo normally lands in ~100-300ms - far
 * faster than a MAM round trip could answer anyway - so this only has to
 * be generous enough not to fire during a slow-but-healthy send.
 */
export const ACK_CATCHUP_DELAY_MS = 2500;

/** The echo is what flips `pending` to false (see addRoomMessage). */
export const hasEchoLanded = (roomJID: string, messageId: string): boolean => {
  const msg = store
    .getState()
    .rooms.rooms?.[roomJID]?.messages?.find(
      (m) => m.id === messageId || m.xmppId === messageId
    );
  return Boolean(msg && msg.pending === false);
};

/**
 * Safety net for a send whose MUC echo never arrives (e.g. our presence
 * silently dropped): re-assert presence and pull history - ONCE, and only
 * if the echo really is missing.
 *
 * It must stay a safety net. This used to be a poll: an immediate fetch on
 * every send plus a retry loop re-arming every 700ms for 5s until the echo
 * landed. Every getHistoryStanza makes the server re-send the room's last
 * 10-20 archived messages down the socket, so one send produced ~6 MAM
 * replies (9 worst case) - the "I get my message back 4 times" seen in the
 * WS frames. It was self-amplifying too: a slower echo fired more history
 * storms, and each storm's stanzas fed the reducer/persist churn that was
 * slowing the echo down in the first place.
 *
 * @returns the timer, so the caller can cancel it on unmount.
 */
export const scheduleAckCatchup = (
  client: XmppClient,
  roomJID: string,
  messageId: string,
  onSettled?: () => void
): ReturnType<typeof setTimeout> =>
  setTimeout(() => {
    onSettled?.();
    if (hasEchoLanded(roomJID, messageId)) return;

    client
      .presenceInRoomStanza(roomJID, 0, 1200, true)
      .catch(() => {})
      .finally(() => {
        // Presence may itself have unblocked the echo while we waited.
        if (hasEchoLanded(roomJID, messageId)) return;
        client
          .getHistoryStanza(roomJID, 20, undefined, undefined, {
            source: 'send_ack',
          })
          .catch(() => {});
      });
  }, ACK_CATCHUP_DELAY_MS);

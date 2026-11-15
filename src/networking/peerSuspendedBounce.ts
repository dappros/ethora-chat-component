import type { Element } from 'ltx';
import { store } from '../roomStore';
import { markMessageUndeliverable } from '../roomStore/roomsSlice';
import { removeMessageFromHeapById } from '../roomStore/roomHeapSlice';
import { setCallError } from '../roomStore/callSlice';
import {
  getPrivatePeerXmppUsername,
  isPeerSuspendedBounce,
  PEER_SUSPENDED_FAILURE,
  toPeerKey,
} from '../helpers/suspendedPeers';
import { isLikelyMucJid } from '../helpers/isLikelyMucJid';
import {
  clearSendFailureWatchdog,
  endSendRetry,
} from '../helpers/sendFailureWatchdog';
import { translateKey } from '../i18n/strings';
import { ethoraLogger } from '../helpers/ethoraLogger';
import { markPeerSuspendedNow } from './suspendedPeersLookup';

/**
 * The chat server refused a 1:1 message or a call signal because the
 * recipient is suspended (see isPeerSuspendedBounce for the stanza). The
 * recipient is marked suspended, the message it bounced is marked failed
 * for good ("Not delivered: this account is suspended"), and a call being
 * placed to that account ends with the same notice.
 *
 * Returns true when the stanza was such a bounce, so nothing else handles
 * it (a bounced call signal still carries its <data type="call-*">).
 */
export const onPeerSuspendedBounce = (stanza: Element): boolean => {
  if (!isPeerSuspendedBounce(stanza)) return false;

  const from = String(stanza.attrs?.from || '').split('/')[0];
  const messageId = String(stanza.attrs?.id || '');
  const state = store.getState();
  const me = state.chatSettingStore?.user?.xmppUsername || '';

  // The contract names the recipient's own JID. Should a 1:1 room ever
  // answer for it instead, its other member is the recipient.
  let roomJID: string | undefined;
  let peer = '';
  if (isLikelyMucJid(from)) {
    const room = state.rooms?.rooms?.[from];
    if (room) roomJID = from;
    peer = getPrivatePeerXmppUsername(room, me);
  } else {
    peer = toPeerKey(from);
  }

  ethoraLogger.log(
    `[XMPP] message_error peer_suspended id=${messageId} from=${from}`
  );

  if (peer) markPeerSuspendedNow(peer);

  if (messageId) {
    store.dispatch(
      markMessageUndeliverable({
        messageId,
        reason: PEER_SUSPENDED_FAILURE,
        roomJID,
      })
    );
    store.dispatch(removeMessageFromHeapById(messageId));
    clearSendFailureWatchdog(messageId);
    endSendRetry(messageId);
  }

  const call = state.call;
  if (
    peer &&
    call &&
    call.phase !== 'idle' &&
    call.direction === 'outgoing' &&
    toPeerKey(call.peerXmppUsername || '') === peer
  ) {
    const settings = state.chatSettingStore;
    store.dispatch(
      setCallError(
        translateKey(
          'peer.suspended.notice',
          settings?.config?.i18n?.locale || settings?.langSource,
          settings?.config?.i18n?.strings
        )
      )
    );
  }
  return true;
};

import { Element } from 'ltx';
import {
  onDeleteMessage,
  onEditMessage,
  onRealtimeMessage,
  onMessageHistory,
  onGetLastMessageArchive,
  handleComposing,
  onChatInvite,
  onPresenceInRoom,
  onGetChatRooms,
  // onGetMembers,
  onGetRoomInfo,
  onNewRoomCreated,
  onReactionMessage,
  onReactionHistory,
  onRoomKicked,
  onRoomMembershipChange,
  onMembersRefreshSignal,
  onMessageError,
  onUserUpdate,
  onChatUpdate,
} from '../stanzaHandlers';
import XmppClient from '../xmppClient';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { onCallTokenMessage } from '../callTokenStanza';
import { accountDomain, isE2eeEnabled } from '../../e2ee';
import { decryptStanzaInPlace, encryptedCarrier } from '../../e2ee/stanza';

// Unwrap mucsub event wrappers so downstream handlers see the inner stanza
// (which has the original id like 'deleteMessageStanza' / 'edit-message-*').
// Server sends: <message id='<mucsubItemId>'><event><items><item><message id='deleteMessageStanza'>...
const unwrapMucsubMessage = (stanza: Element): Element => {
  const inner = stanza
    ?.getChild?.('event', 'http://jabber.org/protocol/pubsub#event')
    ?.getChild?.('items')
    ?.getChild?.('item')
    ?.getChild?.('message');
  return (inner as Element) || stanza;
};

/**
 * Decrypts in place and re-dispatches the stanza, so the handlers below see
 * an ordinary message. See e2ee/stanza.ts for why the rewrite works this way.
 */
async function decryptAndRedispatch(
  stanza: Element,
  xmppWs: XmppClient
): Promise<void> {
  const outcome = await decryptStanzaInPlace(stanza, accountDomain(xmppWs.client));
  // 'drop': session maintenance, nothing to render
  if (outcome === 'drop') return;
  handleStanza(stanza, xmppWs);
}

export function handleStanza(stanza: Element, xmppWs: XmppClient) {
  // E2EE seam. Inert unless the host app enabled encryption; when it did,
  // the stanza is decrypted and then re-dispatched through this same
  // function, with no <encrypted> left to match a second time.
  if (isE2eeEnabled() && stanza?.name === 'message' && encryptedCarrier(stanza)) {
    void decryptAndRedispatch(stanza, xmppWs).catch((err) =>
      ethoraLogger.log('OMEMO: failed to handle encrypted stanza', err)
    );
    return;
  }

  if (stanza?.attrs?.type === 'headline') {
    onUserUpdate(stanza);
    onChatUpdate(stanza);
    return;
  }

  if (stanza?.name === 'message' && onCallTokenMessage(stanza)) {
    return;
  }

  switch (stanza.name) {
    case 'message': {
      const unwrapped = unwrapMucsubMessage(stanza);
      onMessageError(unwrapped, xmppWs);
      onReactionMessage(unwrapped);
      onReactionHistory(unwrapped);
      onDeleteMessage(unwrapped);
      onEditMessage(unwrapped);
      onChatInvite(unwrapped, xmppWs);
      onRoomMembershipChange(unwrapped);
      onMembersRefreshSignal(unwrapped, xmppWs);
      onRealtimeMessage(unwrapped, xmppWs);
      onMessageHistory(unwrapped);
      handleComposing(unwrapped, xmppWs.username);
      onPresenceInRoom(unwrapped);
      break;
    }
    case 'presence':
      onRoomKicked(stanza);
      onPresenceInRoom(stanza);
      break;
    case 'iq':
      onGetChatRooms(stanza, xmppWs);
      onRealtimeMessage(stanza, xmppWs);
      onPresenceInRoom(stanza);
      // onGetMembers(stanza);
      onGetRoomInfo(stanza);
      onGetLastMessageArchive(stanza);
      break;
    case 'room-config':
      onNewRoomCreated(stanza, xmppWs);
      break;
    default:
      ethoraLogger.log('Unhandled stanza type:', stanza.name);
  }
}

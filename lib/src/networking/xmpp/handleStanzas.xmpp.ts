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

export function handleStanza(stanza: Element, xmppWs: XmppClient) {
  if (stanza?.attrs?.type === 'headline') {
    onUserUpdate(stanza);
    onChatUpdate(stanza);
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

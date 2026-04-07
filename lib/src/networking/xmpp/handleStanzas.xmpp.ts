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
  onMessageError,
  onUserUpdate,
  onChatUpdate,
} from '../stanzaHandlers';
import XmppClient from '../xmppClient';
import { ethoraLogger } from '../../helpers/ethoraLogger';

export function handleStanza(stanza: Element, xmppWs: XmppClient) {
  if (stanza?.attrs?.type === 'headline') {
    onUserUpdate(stanza);
    onChatUpdate(stanza);
    return;
  }
  switch (stanza.name) {
    case 'message':
      onMessageError(stanza, xmppWs);
      onReactionMessage(stanza);
      onReactionHistory(stanza);
      onDeleteMessage(stanza);
      onEditMessage(stanza);
      onChatInvite(stanza, xmppWs);
      onRealtimeMessage(stanza, xmppWs);
      onMessageHistory(stanza);
      handleComposing(stanza, xmppWs.username);
      onPresenceInRoom(stanza);
      break;
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

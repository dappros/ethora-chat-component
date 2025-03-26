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
} from '../stanzaHandlers';
import XmppClient from '../xmppClient';

export function handleStanza(stanza: Element, xmppWs: XmppClient) {
  if (stanza?.attrs?.type === 'headline') return;
  switch (stanza.name) {
    case 'message':
      onReactionMessage(stanza);
      onReactionHistory(stanza);
      onDeleteMessage(stanza);
      onEditMessage(stanza);
      onRealtimeMessage(stanza);
      onMessageHistory(stanza);
      handleComposing(stanza, xmppWs.username);
      onChatInvite(stanza, xmppWs);
      onReactionMessage(stanza);
      onReactionHistory(stanza);
      break;
    case 'presence':
      onPresenceInRoom(stanza);
      break;
    case 'iq':
      onGetChatRooms(stanza, xmppWs);
      onRealtimeMessage(stanza);
      onPresenceInRoom(stanza);
      // onGetMembers(stanza);
      onGetRoomInfo(stanza);
      onGetLastMessageArchive(stanza);
      break;
    case 'room-config':
      onNewRoomCreated(stanza, xmppWs);
      break;
    default:
      console.log('Unhandled stanza type:', stanza.name);
  }
}

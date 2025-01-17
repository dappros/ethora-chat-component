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
  onGetMembers,
  onGetRoomInfo,
  onNewRoomCreated,
  onReactionMessage,
  onReactionHistory,
} from '../stanzaHandlers';

export function handleStanza(stanza: any, xmppWs: any) {
  switch (stanza.name) {
    case 'message':
      onDeleteMessage(stanza);
      onEditMessage(stanza);
      onRealtimeMessage(stanza);
      onMessageHistory(stanza);
      onGetLastMessageArchive(stanza, xmppWs);
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
      onGetMembers(stanza);
      onGetRoomInfo(stanza);
      break;
    case 'room-config':
      onNewRoomCreated(stanza, xmppWs);
      break;
    default:
      console.log('Unhandled stanza type:', stanza.name);
  }
}

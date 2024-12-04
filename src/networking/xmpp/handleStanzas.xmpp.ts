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
} from '../stanzaHandlers';

export function handleStanza(stanza: any, client: any) {
  switch (stanza.name) {
    case 'message':
      onDeleteMessage(stanza);
      onEditMessage(stanza);
      onRealtimeMessage(stanza);
      onMessageHistory(stanza);
      onGetLastMessageArchive(stanza, client);
      handleComposing(stanza, client.username);
      onChatInvite(stanza, client);
      break;
    case 'presence':
      onPresenceInRoom(stanza);
      break;
    case 'iq':
      onGetChatRooms(stanza, client);
      onRealtimeMessage(stanza);
      onPresenceInRoom(stanza);
      onGetMembers(stanza);
      onGetRoomInfo(stanza);
      break;
    case 'room-config':
      onNewRoomCreated(stanza, client);
      break;
    default:
      console.log('Unhandled stanza type:', stanza.name);
  }
}

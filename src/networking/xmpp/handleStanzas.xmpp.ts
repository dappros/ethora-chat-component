import { Element } from 'ltx';
import {
  onRealtimeMessage,
  handleComposing,
  onPresenceInRoom,
  handleAnonymResponse,
} from '../stanzaHandlers';
import XmppClient from '../xmppClient';

export function handleStanza(stanza: Element, xmppWs: XmppClient) {
  if (stanza?.attrs?.type === 'headline') return;
  switch (stanza.name) {
    case 'message':
      handleAnonymResponse(stanza);
      onRealtimeMessage(stanza);
      handleComposing(stanza, xmppWs.username);
      break;
    case 'presence':
      onPresenceInRoom(stanza);
      break;
    case 'iq':
      onRealtimeMessage(stanza);
      onPresenceInRoom(stanza);
      break;
    default:
      console.log('Unhandled stanza type:', stanza.name);
  }
}

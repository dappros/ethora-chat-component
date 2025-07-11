import { xml } from '@xmpp/client';

export function sendPing(client: any, to: string, id?: string) {
  if (
    client.status !== 'online' ||
    client._status === 'closing' ||
    client._status === 'closed'
  ) {
    return null;
  }

  const pingId =
    id || 'ping-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const pingStanza = xml(
    'iq',
    { type: 'get', to, id: pingId },
    xml('ping', 'urn:xmpp:ping')
  );
  client.send(pingStanza);
  return pingId;
}

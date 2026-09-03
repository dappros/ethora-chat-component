import { Client, xml } from '@xmpp/client';

// Fire-and-forget: the 'getUserRooms' iq result is consumed by the global
// stanza dispatcher (onGetChatRooms in stanzaHandlers.ts). This used to
// register a no-op per-call stanza listener that lingered for 2s and
// received every stanza in that window for nothing.
export const getRooms = async (client: Client): Promise<any> => {
  const message = xml(
    'iq',
    {
      type: 'get',
      from: client.jid?.toString(),
      id: 'getUserRooms',
    },
    xml('query', { xmlns: 'ns:getrooms' })
  );

  try {
    await client.send(message);
    return null;
  } catch (err) {
    console.error('Error sending getRooms request:', err);
    return null;
  }
};

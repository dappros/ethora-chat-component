import { Client, xml } from '@xmpp/client';

export type RoomAccess = 'open' | 'membersOnly' | 'notFound' | 'unknown';

const NS_DISCO_INFO = 'http://jabber.org/protocol/disco#info';

type IqRequester = { iqCaller: Pick<Client['iqCaller'], 'request'> };

export const getRoomAccess = async (
  roomJID: string,
  client: IqRequester,
  timeoutMs = 5000
): Promise<RoomAccess> => {
  try {
    const res = await client.iqCaller.request(
      xml('iq', { type: 'get', to: roomJID }, xml('query', { xmlns: NS_DISCO_INFO })),
      timeoutMs
    );
    const features = (res.getChild('query', NS_DISCO_INFO)?.getChildren('feature') || []).map(
      (feature) => feature.attrs.var
    );
    if (features.includes('muc_membersonly')) return 'membersOnly';
    if (features.includes('muc_open')) return 'open';
    return 'unknown';
  } catch (error) {
    const condition = (error as { condition?: string } | null)?.condition;
    if (condition === 'item-not-found') return 'notFound';
    if (condition === 'forbidden' || condition === 'registration-required') return 'membersOnly';
    return 'unknown';
  }
};

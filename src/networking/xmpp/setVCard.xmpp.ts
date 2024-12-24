import { xml } from '@xmpp/client';

export function setVcard(fullname: string, client: any) {
  const message = xml(
    'iq',
    {
      type: 'set',
      id: 'setVcard',
    },
    xml(
      'vCard',
      {
        xmlns: 'vcard-temp',
      },
      xml('FN', null, fullname)
    )
  );
  client.send(message);
}

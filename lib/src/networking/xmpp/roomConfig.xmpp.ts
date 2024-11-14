import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';
import { Element } from 'ltx';

export function roomConfig(
  roomId: string,
  roomTitle: string,
  roomDescription: string,
  client: Client
) {
  const id = `room-config:${Date.now().toString()}`;

  let stanzaHdlrPointer: {
    (el: Element): void;
    (stanza: any): void;
    (el: Element): void;
  };

  const unsubscribe = () => {
    client.off('stanza', stanzaHdlrPointer);
  };

  const responsePromise = new Promise((resolve) => {
    stanzaHdlrPointer = (stanza: { attrs: { [x: string]: string } }) => {
      if (stanza.attrs['id'] === id && stanza.attrs['type'] === 'result') {
        unsubscribe();
        resolve(true);
      }
    };

    client.on('stanza', stanzaHdlrPointer);

    const message = xml(
      'iq',
      {
        id: id,
        to: roomId,
        type: 'set',
      },
      xml(
        'query',
        { xmlns: 'http://jabber.org/protocol/muc#owner' },
        xml(
          'x',
          { xmlns: 'jabber:x:data', type: 'submit' },
          xml(
            'field',
            { var: 'FORM_TYPE' },
            xml('value', {}, 'http://jabber.org/protocol/muc#roomconfig')
          ),
          xml(
            'field',
            { var: 'muc#roomconfig_roomname' },
            xml('value', {}, roomTitle)
          ),
          xml(
            'field',
            { var: 'muc#roomconfig_roomdesc' },
            xml('value', {}, roomDescription)
          )
        )
      )
    );

    client.send(message);
  });

  const timeoutPromise = createTimeoutPromise(2000, unsubscribe);

  return Promise.race([responsePromise, timeoutPromise]);
}

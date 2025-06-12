import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';
import { Element } from 'ltx';
import { IMessage } from '../../types/types';
import { getDataFromXml } from '../../helpers/getDataFromXml';
import { createMessageFromXml } from '../../helpers/createMessageFromXml';

export const getHistory = async (
  client: Client,
  chatJID: string,
  max: number,
  before?: number,
  otherId?: string
): Promise<IMessage[] | undefined> => {
  if (typeof chatJID !== 'string') return;
  const fixedChatJid = chatJID.includes('@')
    ? chatJID
    : `${chatJID}@conference.dev.xmpp.ethoradev.com`;

  const id = otherId ?? `get-history:${Date.now().toString()}`;

  let stanzaHdlrPointer: {
    (el: Element): void;
    (stanza: any): void;
  };

  const unsubscribe = () => {
    client.off('stanza', stanzaHdlrPointer);
  };

  const responsePromise = new Promise((resolve, reject) => {
    let messages: Element[] = [];

    stanzaHdlrPointer = async (stanza) => {
      const result = stanza.getChild('result');

      if (
        stanza.is('message') &&
        stanza.attrs['from'] &&
        stanza.attrs['from'].startsWith(fixedChatJid) &&
        result
      ) {
        const messageEl = result.getChild('forwarded')?.getChild('message');

        messages.push(messageEl);
      }

      if (
        stanza.is('iq') &&
        stanza.attrs['id'] === id &&
        stanza.attrs['type'] === 'result'
      ) {
        let mainMessages: IMessage[] = [];

        for (const msg of messages) {
          const reactions = msg?.getChild('reactions');
          const text = msg.getChild('body')?.getText();

          if (text || reactions) {
            const { data, id, body, ...rest } = await getDataFromXml(msg);

            if (!data) {
              console.log('No data in stanza');
              return;
            }

            const message = await createMessageFromXml({
              data,
              id,
              body,
              ...rest,
            });

            mainMessages.push(message);
          }
        }
        unsubscribe();
        resolve(mainMessages);
      }

      if (
        stanza.is('iq') &&
        stanza.attrs.id === id &&
        stanza.attrs.type === 'error'
      ) {
        unsubscribe();
        reject();
      }
    };

    client?.on('stanza', stanzaHdlrPointer);

    const message = xml(
      'iq',
      {
        type: 'set',
        to: fixedChatJid,
        id: id,
      },
      xml(
        'query',
        { xmlns: 'urn:xmpp:mam:2' },
        xml(
          'set',
          { xmlns: 'http://jabber.org/protocol/rsm' },
          xml('max', {}, max.toString()),
          before ? xml('before', {}, before.toString()) : xml('before')
        )
      )
    );

    client?.send(message).catch((err) => console.log('err on load', err));
  });

  const timeoutPromise = createTimeoutPromise(10000, unsubscribe);

  try {
    // @ts-ignore
    const res: IMessage[] | null = await Promise.race<[IMessage[] | null]>([
      responsePromise as Promise<IMessage[] | null>,
      timeoutPromise as Promise<null>,
    ]);
    return res;
  } catch (e) {
    console.log('=-> error in', fixedChatJid, e);
    return [];
  }
};

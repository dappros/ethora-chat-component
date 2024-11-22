import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';
import { Element } from 'ltx';

export const getHistory = async (
  client: Client,
  chatJID: string,
  max: number,
  before?: number
) => {
  const id = `get-history:${Date.now().toString()}`;

  let stanzaHdlrPointer: {
    (el: Element): void;
    (stanza: any): void;
  };

  const unsubscribe = () => {
    client.off('stanza', stanzaHdlrPointer);
  };

  const responsePromise = new Promise((resolve, reject) => {
    let messages: Element[] = [];

    stanzaHdlrPointer = (stanza) => {
      const result = stanza.getChild('result');

      if (
        stanza.is('message') &&
        stanza.attrs['from'] &&
        stanza.attrs['from'].startsWith(chatJID) &&
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
        let mainMessages: Record<string, string>[] = [];

        for (const msg of messages) {
          const text = msg.getChild('body')?.getText();

          if (text) {
            let parsedEl: Record<string, string> = {};

            parsedEl.text = text;
            parsedEl.from = msg.attrs['from'];
            parsedEl.id = msg.getChild('archived')?.attrs['id'];
            parsedEl.created = parsedEl.id.slice(0, 13);
            const data = msg.getChild('data');

            if (!data || !data.attrs) {
              continue;
            }

            for (const [key, value] of Object.entries(data.attrs)) {
              parsedEl[key] = value as string;
            }

            // ignore messages wich has isReply but there is no mainMessage field
            if (parsedEl.isReply === 'true' && !parsedEl.mainMessage) {
              continue;
            }

            // fucntionality to not to add deleted messages into array
            // if (msg.getChild("deleted")?.attrs["timestamp"]) continue;

            if (parsedEl.mainMessage) {
              try {
                parsedEl.mainMessage = JSON.parse(parsedEl.mainMessage);
              } catch (e) {
                // ignore message if mainMessage is not parsable
                continue;
              }
            }

            mainMessages.push(parsedEl);
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
        to: chatJID,
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
    const res = await Promise.race([responsePromise, timeoutPromise]);
    return res;
  } catch (e) {
    console.log('=-> error in', chatJID, e);
    return null;
  }
};

// import { Client, xml } from '@xmpp/client';

// export const getHistory = async (
//   client: Client,
//   chatJID: string,
//   max: number,
//   before?: number
// ) => {
//   const id = `get-history:${Date.now().toString()}`;

//   const message = xml(
//     'iq',
//     {
//       type: 'set',
//       to: chatJID,
//       id: id,
//     },
//     xml(
//       'query',
//       { xmlns: 'urn:xmpp:mam:2' },
//       xml(
//         'set',
//         { xmlns: 'http://jabber.org/protocol/rsm' },
//         xml('max', {}, max.toString()),
//         before ? xml('before', {}, before.toString()) : xml('before')
//       )
//     )
//   );

//   client?.send(message).catch((err) => console.log('err on load', err));
// };

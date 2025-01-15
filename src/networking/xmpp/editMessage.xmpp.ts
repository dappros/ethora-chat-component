import { Client, xml } from '@xmpp/client';

export async function editMessage(
  client: Client,
  chatId: string,
  messageId: string,
  text: string
) {
  const id = `edit-message-${Date.now().toString()}`;
  const xmlMessage = xml(
    'message',
    {
      to: chatId,
      type: 'groupchat',
      id: id,
    },
    xml('replace', {
      id: messageId,
      text: text,
    })
  );
  // let stanzaHdlrPointer;
  // const unsubscribe = () => {
  //   client.off('stanza', stanzaHdlrPointer)
  // }
  // const responsePromise = new Promise((resolve, _) => {
  //   stanzaHdlrPointer = (stanza) => {
  //     if (stanza.is("message") && stanza.attrs["id"] === id) {
  //         console.log("edit message response ", stanza.toString())
  //         resolve(true)
  //     //   const msg = stanza
  //     //   const text = msg.getChild('body')?.getText()
  //     //   if (text) {
  //     //     let parsedEl: any = {}
  //     //     const result = ws.realtimeMessageParser(msg)
  //     //     unsubscribe()
  //     //     resolve(true)
  //     //   }
  //     }
  //   }
  //   client.on("stanza", stanzaHdlrPointer)
  //   console.log("editMessage:send:stanza ", xmlMessage.toString())
  client.send(xmlMessage);
  // })
  // const timeoutPromise = createTimeoutPromise(10000, unsubscribe)
  // return Promise.race([responsePromise, timeoutPromise]);
}

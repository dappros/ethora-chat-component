import { Element } from 'ltx';
import { store } from '../roomStore';
import { setComposing, setRoomRole } from '../roomStore/roomsSlice';
import { addRoomMessage as addAssistantRoomMessage } from '../roomStore/assistantMessageSlice';
import { createMessageFromXml } from '../helpers/createMessageFromXml';
import { getDataFromXml } from '../helpers/getDataFromXml';
import { AsisstantUserType, IMessage } from '../types/types';
// TO DO: we are thinking to refactor this code in the following way:
// each stanza will be parsed for 'type'
// then it will be handled based on the type
// XMPP parsing will be done universally as a pre-processing step
// then handlers for different types will work with a Javascript object
// types: standard, coin transfer, is composing, attachment (media), token (nft) or smart contract
// types can be added into our chat protocol (XMPP stanza add field type="") to make it easier to parse here

//core default
const onRealtimeMessage = async (stanza: Element) => {
  const isAssistantMessage = stanza.attrs.type === 'chat';

  if (isAssistantMessage) {
    const { data, id, body, ...rest } = await getDataFromXml(stanza);

    if (!data) {
      console.log('No data in stanza');
      return;
    }

    const message = await createMessageFromXml({
      data,
      id,
      body,
      ...rest,
      ...(isAssistantMessage ? { isAssistantMessage: true } : {}),
    });

    // Dispatch to assistant message slice
    store.dispatch(
      addAssistantRoomMessage({
        roomJID: stanza.attrs.from.split('/')[0],
        message,
      })
    );

    return message;
  }
};

const handleAnonymResponse = async (stanza: Element) => {
  if (stanza.is('message') && stanza.attrs.type === 'error') {
    const error = stanza.getChild('error');
    if (error) {
      const errorCode = error.attrs.code;
      const errorText = error.getChildText('text');
      console.error(`Anonym response error: ${errorCode} - ${errorText}`);
    }
  } else if (stanza.is('message')) {
    const body = stanza.getChildText('body');
    console.log(`Anonym response: ${body}`);
  }
};

const handleComposing = async (stanza: Element, currentUser: string) => {
  if (stanza.getChild('paused') || stanza.getChild('composing')) {
    const composingUser = stanza.attrs?.from?.split('/')?.[1];

    if (
      composingUser &&
      currentUser?.toLowerCase()?.replace(/_/g, '') !==
        composingUser?.replace(/_/g, '')
    ) {
      const chatJID = stanza.attrs?.from.split('/')[0];

      let composingList = [];

      !!stanza?.getChild('composing')
        ? composingList.push(
            stanza.getChild('data').attrs?.fullName?.split(' ')?.[0] || 'User'
          )
        : composingList.pop();

      store.dispatch(
        setComposing({
          chatJID: chatJID,
          composing: !!stanza?.getChild('composing'),
          composingList,
        })
      );
    }
  }
};

const onPresenceInRoom = (stanza: Element | any) => {
  if (stanza.attrs.id === 'presenceInRoom' && !stanza.getChild('error')) {
    const roomJID: string = stanza.attrs.from.split('/')[0];
    const role: string = stanza?.children[1]?.children[0]?.attrs.role;
    store.dispatch(setRoomRole({ chatJID: roomJID, role: role }));
  }
};

export {
  onRealtimeMessage,
  onPresenceInRoom,
  handleComposing,
  handleAnonymResponse,
};

import { AppDispatch } from '../roomStore';
import { setCurrentRoom } from '../roomStore/roomsSlice';

interface XmppConfig {
  xmppSettings?: {
    conference?: string;
  };
}

interface SelectRoomArgs {
  roomJID?: string;
  wasAutoSelected: boolean;
  config: XmppConfig;
  dispatch: AppDispatch;
}

const PUSH_MESSAGE_ID_KEY = '@ethora/chat-component-pushMessageId';
const PUSH_ROOM_JID_KEY = '@ethora/chat-component-pushRoomJid';

export const chatAutoEnterer = ({
  roomJID,
  wasAutoSelected,
  config,
  dispatch,
}: SelectRoomArgs): void => {
  if (roomJID) {
    dispatch(setCurrentRoom({ roomJID }));
    return;
  }

  if (!wasAutoSelected) {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const chatId = searchParams.get('chatId');
      const messageId =
        searchParams.get('messageId') || searchParams.get('msgId');

      if (chatId) {
        const conferenceDomain = (config.xmppSettings?.conference ?? '').trim();
        // Without a conference server there is no correct JID to build.
        // Defaulting to '' used to dispatch `<chatId>@`, which selects a room
        // that can never exist and leaves the pane blank. In a multi-tenant
        // deploy the conference must come from the host's own config, so
        // when it is missing the only honest move is to do nothing.
        if (!conferenceDomain) return;
        const resolvedRoomJID = chatId.includes('@')
          ? chatId
          : `${chatId}@${conferenceDomain}`;
        if (messageId && typeof localStorage !== 'undefined') {
          localStorage.setItem(PUSH_MESSAGE_ID_KEY, messageId);
          localStorage.setItem(PUSH_ROOM_JID_KEY, resolvedRoomJID);
        }
        dispatch(
          setCurrentRoom({
            roomJID: resolvedRoomJID,
          })
        );
      }
    }
  }
};

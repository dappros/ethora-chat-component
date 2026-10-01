import { AppDispatch } from '../roomStore';
import { setCurrentRoom } from '../roomStore/roomsSlice';
import { openRoomAtMessage } from './openRoomAtMessage';

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
        // The link names the message by whichever id the sender had; the
        // jump matches it against message.id and message.xmppId. A link with
        // no message id just opens the room.
        openRoomAtMessage(dispatch, resolvedRoomJID, messageId);
      }
    }
  }
};

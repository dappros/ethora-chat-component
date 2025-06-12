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
    const searchParams = new URLSearchParams(window.location.search);
    const chatId = searchParams.get('chatId');

    if (chatId) {
      const conferenceDomain = config.xmppSettings?.conference ?? '';
      dispatch(
        setCurrentRoom({
          roomJID: `${chatId}@${conferenceDomain}`,
        })
      );
    }
  }
};

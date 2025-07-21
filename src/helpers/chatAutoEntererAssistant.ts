import { AppDispatch } from '../roomStore';
import { setCurrentRoom } from '../roomStore/roomsSlice';

interface XmppConfig {
  xmppSettings?: {
    conference?: string;
  };
}

interface SelectRoomArgs {
  roomJID?: string;
  config: XmppConfig;
  dispatch: AppDispatch;
}

export const chatAutoEnterer = ({
  roomJID,
  dispatch,
}: SelectRoomArgs): void => {
  if (roomJID) {
    dispatch(setCurrentRoom({ roomJID }));
    return;
  }
};

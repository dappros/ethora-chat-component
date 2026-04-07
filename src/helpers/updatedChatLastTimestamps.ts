import { setLastViewedTimestamp } from '../roomStore/roomsSlice';
import { ethoraLogger } from './ethoraLogger';

export const updatedChatLastTimestamps = (
  roomTimestampObject: [jid: string, timestamp: string],
  dispatch: any
) => {
  if (!roomTimestampObject) return;

  if (roomTimestampObject && Object.keys(roomTimestampObject).length > 0) {
    const roomTimestampArray = Object.entries(roomTimestampObject).map(
      ([jid, timestamp]) => ({
        jid,
        timestamp,
      })
    );
    ethoraLogger.log('getting roomTimestampArray', roomTimestampArray);

    roomTimestampArray.forEach(({ jid, timestamp }) => {
      if (jid) {
        dispatch(
          setLastViewedTimestamp({
            chatJID: jid,
            timestamp: Number(timestamp || 0),
          })
        );
      }
    });
  }
};

import { setLastViewedTimestamp } from '../roomStore/roomsSlice';
import { ethoraLogger } from './ethoraLogger';
import { store } from '../roomStore';
import { getTimestampFromUnknown } from './timestamp';

export const updatedChatLastTimestamps = (
  roomTimestampObject: Record<string, string | number> | null | undefined,
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
        const normalizedIncoming = getTimestampFromUnknown(timestamp);
        if (!normalizedIncoming) return;

        const currentLocal =
          getTimestampFromUnknown(
            store.getState().rooms.rooms?.[jid]?.lastViewedTimestamp
          ) || 0;

        // Do not overwrite fresher local read marker with stale private-store value.
        if (currentLocal > 0 && normalizedIncoming < currentLocal) {
          return;
        }

        dispatch(
          setLastViewedTimestamp({
            chatJID: jid,
            timestamp: normalizedIncoming,
          })
        );
      }
    });
  }
};

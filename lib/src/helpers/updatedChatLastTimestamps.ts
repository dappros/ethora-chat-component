import { setLastViewedTimestamp } from '../roomStore/roomsSlice';

export const updatedChatLastTimestamps = (
  roomTimestampObject: [jid: string, timestamp: string],
  dispatch: any
) => {
  if (roomTimestampObject && Object.keys(roomTimestampObject).length > 0) {
    const roomTimestampArray = Object.entries(roomTimestampObject).map(
      ([jid, timestamp]) => ({
        jid,
        timestamp,
      })
    );
    console.log('getting roomTimestampArray', roomTimestampArray);

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

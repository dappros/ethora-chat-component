import { IMessage } from '../types/types';
import { ethoraLogger } from './ethoraLogger';
import { isE2eeRoom } from '../e2ee';

interface IMessageWithNewData extends IMessage {
  [x: string]: any;
}

export const createMessageFromXml = async (
  data: IMessageWithNewData
): Promise<IMessage> => {
  if (!data?.body) {
    // ethoraLogger.log('Invalid body.', data);
  }

  if (!data) {
    ethoraLogger.log('Invalid arguments: data, id, and roomJid are required.');
  }

  // In an encrypted room, anything that did not come out of an OMEMO payload
  // was sent in clear - the seam stamps `omemoEncrypted` on the ones that did.
  const roomJid = String((data as any)?.roomJid || '');
  const unencrypted =
    isE2eeRoom(roomJid) && (data as any)?.data?.omemoEncrypted !== 'true';

  const message: IMessage = {
    ...data,
    ...data.data,
    ...(unencrypted ? { unencrypted: true } : {}),
    // Server marks deleted messages in MAM with a `<deleted>` child; map that
    // onto the model's `isDeleted` flag so the bubble renders the tombstone
    // instead of the stale body.
    isDeleted: !!(data as any)?.deleted || !!(data as any)?.isDeleted,
  };

  return message;
};

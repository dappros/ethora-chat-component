import { IMessage } from '../types/types';
import { ethoraLogger } from './ethoraLogger';

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

  const message: IMessage = {
    ...data,
    ...data.data,
    // Server marks deleted messages in MAM with a `<deleted>` child; map that
    // onto the model's `isDeleted` flag so the bubble renders the tombstone
    // instead of the stale body.
    isDeleted: !!(data as any)?.deleted || !!(data as any)?.isDeleted,
  };

  return message;
};

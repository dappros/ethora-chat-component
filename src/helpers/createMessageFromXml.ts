import { IMessage } from '../types/types';

interface IMessageWithNewData extends IMessage {
  [x: string]: any;
}

export const createMessageFromXml = async (
  data: IMessageWithNewData
): Promise<IMessage> => {
  if (!data?.body) {
    throw new Error("Invalid body: 'getText' method is missing.");
  }

  if (!data) {
    console.log('Invalid arguments: data, id, and roomJid are required.');
  }

  const message: IMessage = {
    ...data,
    ...data.data,
  };

  return message;
};

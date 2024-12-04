import { IMessage } from "../types/types";

export const createMainMessageForThread = (message: IMessage): string => {
  const data = {
    text: message.body,
    id: message.id,
    userName: message.user.name,
    createdAt: message.date,
    imageLocation: message.location,
    imagePreview: message.locationPreview,
    mimeType: message.mimetype,
    size: '',
    duration: '',
    waveForm: '',
    attachmentId: '',
    wrappable: '',
    nftActionType: '',
    contractAddress: '',
    roomJid: message.roomJid,
    nftId: '',
  };
  return JSON.stringify(data);
};
import { IMessage } from "../types/types";
import { getMessageCaption } from "./caption";

export const createMainMessageForThread = (message: IMessage): string => {
  // A media message's reply preview reads its caption when it has one. A
  // sealed caption stays out: this JSON rides in the clear <data> of the reply.
  const caption =
    message.clientEncrypted === 'true' ? undefined : getMessageCaption(message);
  const data = {
    text: caption ?? message.body,
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
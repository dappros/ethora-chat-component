import { IMessage } from "../types/types";
import { getMessageCaption } from "./caption";
import { isMediaMessage } from "./attachments";
import { getMediaLabel } from "./mediaLabel";

export const createMainMessageForThread = (
  message: IMessage,
  t?: (key: string, vars?: Record<string, string | number>) => string
): string => {
  // A media message's reply preview reads its caption when it has one (or the
  // text an older sender put in its body), else what the files are ("Photo").
  // A sealed caption stays out: this JSON rides in the clear <data> of the
  // reply.
  const sealed = message.clientEncrypted === 'true';
  const caption = sealed ? undefined : getMessageCaption(message);
  const label =
    !sealed && !caption && t && isMediaMessage(message) ? getMediaLabel(message, t) : '';
  const data = {
    text: caption ?? (label || message.body),
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

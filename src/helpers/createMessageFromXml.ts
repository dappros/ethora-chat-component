import { Element } from 'ltx';
import { IMessage } from '../types/types';

export const createMessageFromXml = async (
  data: {
    [x: string]: any;
    coinsInMessage?: any;
    numberOfReplies?: any;
    isSystemMessage?: any;
    isMediafile?: any;
    locationPreview?: any;
    mimetype?: any;
    location?: any;
    senderWalletAddress?: any;
    senderFirstName?: any;
    senderLastName?: any;
    photoURL?: any;
    senderJID?: any;
    token?: any;
    refreshToken?: any;
    roomJid?: any;
    tokenAmount?: any;
    quickReplie?: any;
    notDisplayedValue?: any;
    showInChannel?: any;

    //attachment
    attachmentId?: any;
    createdAt?: any;
    expiresAt?: any;
    fileName?: any;
    originalName?: any;
    ownerKey?: any;
    receiverMessageId?: any;
    size?: any;
    updatedAt?: any;
    userId?: any;
  },
  body: Element | undefined,
  id: string,
  from: any
): Promise<any> => {
  // change to iMESSAGES
  if (!body || typeof body.getText !== 'function') {
    throw new Error("Invalid body: 'getText' method is missing.");
  }

  if (!data || !id || !from) {
    console.log('Invalid arguments: data, id, and from are required.');
  }

  const message: IMessage = {
    id: id,
    body: body.getText(),
    roomJid: from,
    roomJID: from,
    date: new Date(+id?.slice(0, 13)).toISOString(),
    key: `${Date.now() + Number(id)}`,
    numberOfReplies: data?.numberOfReplies,
    isSystemMessage: data?.isSystemMessage,
    isMediafile: data?.isMediafile,
    locationPreview: data?.locationPreview,
    mimetype: data?.mimetype,
    location: data?.location,
    user: {
      id: data.senderWalletAddress,
      name: `${data.senderFirstName} ${data.senderLastName}`,
      profileImage: data.photoURL,
      token: data.token,
      refreshToken: data.refreshToken,
    },
    ...data,
  };

  return message;
};

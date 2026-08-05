import { Client, xml } from '@xmpp/client';

export function sendMediaMessage(
  client: Client,
  roomJID: string,
  data: any,
  id: string
) {
  const dataToSend = {
    senderJID: client.jid?.toString(),
    senderFirstName: data.firstName,
    senderLastName: data.lastName,
    senderWalletAddress: data.walletAddress,
    isSystemMessage: false,
    tokenAmount: '0',
    receiverMessageId: '0',
    mucname: data.chatName,
    photoURL: data.userAvatar ? data.userAvatar : '',
    isMediafile: true,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    fileName: data.fileName,
    isVisible: data.isVisible,
    location: data.location,
    locationPreview: data.locationPreview,
    mimetype: data.mimetype,
    originalName: data.originalName,
    ownerKey: data.ownerKey,
    size: data.size,
    duration: data?.duration,
    updatedAt: data.updatedAt,
    userId: data.userId,
    waveForm: data.waveForm,
    attachmentId: data?.attachmentId,
    isReply: data?.isReply,
    showInChannel: data?.showInChannel,
    mainMessage: data?.mainMessage,
    roomJid: data?.roomJid,
    push: "true",
  };

  // Multi-attach rides as one extra attribute rather than a new child
  // element: attributes on <data> are what every hop already round-trips
  // (getDataFromXml spreads data.attrs wholesale), and a client that has
  // never heard of `attachments` keeps rendering the flat fields above -
  // which describe attachment #0 - instead of breaking.
  if (data?.attachments) {
    (dataToSend as Record<string, unknown>).attachments = data.attachments;
  }

  const message = xml(
    'message',
    {
      id: id,
      type: 'groupchat',
      from: client.jid?.toString(),
      to: roomJID,
    },
    xml('body', {}, 'media'),
    xml('store', { xmlns: 'urn:xmpp:hints' }),
    xml('data', dataToSend)
  );

  client.send(message);
}

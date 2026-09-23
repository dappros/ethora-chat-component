import { Client, xml } from '@xmpp/client';
import {
  accountDomain,
  isE2eeRoom,
  omemoReady,
  roomRecipients,
} from '../../e2ee';

/** Body of a media stanza in a plain room, and the fallback in an e2ee one. */
const PLAIN_BODY = 'media';

/**
 * What <body> carries in an e2ee room: the key material for each sealed
 * attachment, in the same order as `attachments` / the flat fields on <data>.
 * The real mimetype and filename are not here - they are inside each sealed
 * payload (see e2ee/fileEnvelope.ts), so they survive exactly as long as the
 * bytes do and cannot be stripped off in transit.
 */
export interface E2eeMediaBody {
  v: 1;
  keys: string[];
  /**
   * Real mimetypes, positional with `keys`. The receiver needs these to pick
   * a renderer before downloading - a voice note must show a player, not a
   * download chip - and they would be a metadata leak on <data>, which rides
   * in the clear. In here they cost nothing.
   */
  types?: string[];
}

export async function sendMediaMessage(
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

  const keys: string[] | undefined = data?.e2eeKeys;
  const types: string[] | undefined = data?.e2eeTypes;

  // A sealed attachment says so on <data>. The flag itself reveals nothing the
  // `application/octet-stream` mimetype does not already, and a receiver that
  // never gets the keys still needs to know why the bytes look like noise
  // rather than rendering them as a broken image.
  if (keys?.length) {
    (dataToSend as Record<string, unknown>).clientEncrypted = 'true';
  }

  const body = xml('body', {}, PLAIN_BODY);
  const hints = xml('store', { xmlns: 'urn:xmpp:hints' });

  // E2EE seam. Same trade as sendTextMessage: only <body> is encrypted, and
  // <data> rides in the clear so the push module can still build a
  // notification. For media that is affordable only because the file was
  // sealed before upload - `location` now points at opaque bytes, `mimetype`
  // is octet-stream and `originalName` is a random string. The one thing on
  // <data> that WOULD break the seal is the key material, so it goes here,
  // inside the encrypted envelope, and nowhere else.
  if (keys?.length && isE2eeRoom(roomJID)) {
    const crypto = await omemoReady();
    try {
      if (!crypto) throw new Error('omemo_not_ready');
      const payload: E2eeMediaBody = { v: 1, keys, types };
      const encrypted = await crypto.encryptGroupMessage(
        roomJID,
        roomRecipients(roomJID, accountDomain(client)),
        [xml('body', {}, JSON.stringify(payload))],
        id,
        [xml('data', dataToSend), hints]
      );
      client.send(encrypted);
      return;
    } catch (error) {
      // Unlike text, there is no useful cleartext fallback here: sending the
      // keys in the clear would undo the sealing, and sending without them
      // uploads bytes nobody can ever open. Fail the send so the caller's
      // error path runs and the user is told, rather than leaving an
      // undecryptable attachment in the room forever.
      console.error(
        `OMEMO: refusing to send sealed attachment to ${roomJID} - ${String(
          (error as Error)?.message || error
        )}`
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  const message = xml(
    'message',
    {
      id: id,
      type: 'groupchat',
      from: client.jid?.toString(),
      to: roomJID,
    },
    body,
    hints,
    xml('data', dataToSend)
  );

  client.send(message);
}

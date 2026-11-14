import { IMessage } from '../types/types';
import { ethoraLogger } from './ethoraLogger';
import { isE2eeRoom } from '../e2ee';
import { attachScheduledCallMeta } from './scheduledCallMessage';
import { applyModeration, isMaskedSenderName } from './moderation';

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

  // Trust & Safety. The server already blanks a hidden message and writes
  // the deleted body for a deleted one; applying the action here as well
  // means a message never shows more than its moderation state allows, even
  // if the archive copy still carried content.
  const moderation = (data as any)?.moderation;
  if (moderation?.action) {
    applyModeration(message, moderation.action, moderation.category, moderation.by);
  }

  // A suspension with `nameMode: suspended` rewrites the archived sender to
  // "Suspended" / "account" (and `fullName` to "Suspended account", `photo` and
  // `photoURL` to ""). Kept as a flag (the sender attributes are not
  // persisted) so the bubble can render the masked identity.
  const dataAttrs = (data as any)?.data || {};
  if (
    isMaskedSenderName(
      dataAttrs.senderFirstName,
      dataAttrs.senderLastName,
      dataAttrs.fullName
    )
  ) {
    message.senderMasked = true;
  }

  // `<data type="scheduledCall">` (an invite, an edit or a cancel from the
  // backend): decode the card facts once, here, like callLog.
  return attachScheduledCallMeta(message);
};

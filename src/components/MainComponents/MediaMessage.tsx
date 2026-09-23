import React, { useCallback, useMemo } from 'react';
import { useT } from '../../i18n/useT';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { IMessage } from '../../types/types';
import { RootState } from '../../roomStore';
import { getMessageAttachments } from '../../helpers/attachments';
import { appendFileToken } from '../../helpers/secureFileUrl';
import { deleteRoomMessage } from '../../roomStore/roomsSlice';
import AttachmentList from './AttachmentList';
import SealedAttachmentList from './SealedAttachmentList';

const UnsupportedMedia = styled.div`
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-size: var(--ethora-font-size-sm, 13px);
  font-style: italic;
`;

interface MediaMessageProps {
  /**
   * Legacy props. They describe attachment #0 only and are kept because
   * hosts pass them when overriding the message renderer; `message` is the
   * source of truth whenever it is present.
   */
  mimeType?: string;
  message?: IMessage;
  location?: string;
  locationPreview?: string;
}

const MediaMessage: React.FC<MediaMessageProps> = ({
  mimeType,
  location,
  locationPreview,
  message,
}) => {
  const t = useT();
  const dispatch = useDispatch();
  // Secure (v2) file URLs are membership-gated: append the viewer's own
  // fileToken at render time. Public (v1) URLs pass through untouched.
  // Subscribed via useSelector so a token refresh re-renders the media
  // with a fresh URL (recovering images that failed on an expired token).
  //
  // Applied per attachment rather than to the legacy `location` prop the
  // way the single-file renderer did it: a multi-file message has to
  // token-ise every tile, not just the first one. AttachmentList renders
  // `attachment.location` verbatim, so this is the only place that can
  // do it. Empty stays empty, which keeps AttachmentList's
  // "still uploading" check working.
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );

  const attachments = useMemo(
    () =>
      getMessageAttachments({
        attachments: message?.attachments,
        location: location ?? message?.location,
        locationPreview: locationPreview ?? message?.locationPreview,
        mimetype: mimeType ?? message?.mimetype,
        originalName: message?.originalName,
        fileName: message?.fileName,
        size: message?.size,
      }).map((attachment) => ({
        ...attachment,
        location: appendFileToken(attachment.location, fileToken),
        locationPreview: attachment.locationPreview
          ? appendFileToken(attachment.locationPreview, fileToken)
          : attachment.locationPreview,
      })),
    [
      message?.attachments,
      message?.location,
      message?.locationPreview,
      message?.mimetype,
      message?.originalName,
      message?.fileName,
      message?.size,
      location,
      locationPreview,
      mimeType,
      fileToken,
    ]
  );

  // Last-resort fallback for a file deleted from the Files panel without a
  // local message match to tombstone up front (different room history not
  // loaded locally, or a backend that doesn't round-trip attachmentId - see
  // findMessagesForFile.ts): once the browser confirms the URL is really
  // dead (not just slow), flip this message to the normal deleted-message
  // placeholder instead of leaving a broken-image card in the transcript.
  const roomJid = message?.roomJid;
  const messageId = message?.id;
  const isDeleted = message?.isDeleted;
  const handleUnavailable = useCallback(() => {
    if (!roomJid || !messageId || isDeleted) return;
    dispatch(deleteRoomMessage({ roomJID: roomJid, messageId }));
  }, [dispatch, roomJid, messageId, isDeleted]);

  if (attachments.length === 0) {
    return <UnsupportedMedia>{t('media.unsupported')}</UnsupportedMedia>;
  }

  // Sealed attachments get no preview. The server holds ciphertext and never
  // rendered a thumbnail - that is the point - and building one here would
  // mean downloading and decrypting every attachment in the transcript just
  // to scroll past it. Offer a download instead; nothing is fetched until the
  // viewer asks for it.
  const sealedKeys = message?.e2eeKeys;
  if (sealedKeys?.length) {
    return (
      <SealedAttachmentList
        attachments={attachments}
        keys={sealedKeys}
        types={message?.e2eeTypes}
      />
    );
  }

  return (
    <AttachmentList attachments={attachments} onUnavailable={handleUnavailable} />
  );
};

export default MediaMessage;

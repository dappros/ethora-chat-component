import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { IMessage } from '../../types/types';
import { RootState } from '../../roomStore';
import { getMessageAttachments } from '../../helpers/attachments';
import { appendFileToken } from '../../helpers/secureFileUrl';
import AttachmentList from './AttachmentList';

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

  if (attachments.length === 0) {
    return <div>Unsupported media type</div>;
  }

  return <AttachmentList attachments={attachments} />;
};

export default MediaMessage;

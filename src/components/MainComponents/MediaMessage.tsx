import React, { useMemo } from 'react';
import { IMessage } from '../../types/types';
import { getMessageAttachments } from '../../helpers/attachments';
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
      }),
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
    ]
  );

  if (attachments.length === 0) {
    return <div>Unsupported media type</div>;
  }

  return <AttachmentList attachments={attachments} />;
};

export default MediaMessage;

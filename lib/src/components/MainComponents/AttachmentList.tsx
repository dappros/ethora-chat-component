import React, { useMemo } from 'react';
import { IAttachment } from '../../types/types';
import { getAttachmentName } from '../../helpers/attachments';
import { getFileKind } from '../../helpers/fileKind';
import { AttachmentStack } from '../styled/StyledInputComponents/MediaComponents';
import CustomMessageImage from '../styled/MessageImage';
import CustomMessageVideo from '../styled/VideoMessage';
import AudioMessage from '../styled/AudioMessage';
import PdfMessage from '../styled/PdfMessage';
import FileDownload from '../styled/UnsupportedType';
import AlbumGrid, { AlbumGridItem } from './AlbumGrid';
import { MediaUploadOverlay } from './MediaUploadOverlay';
import styled from 'styled-components';
import { useT } from '../../i18n/useT';

/** Full-width renderer: what a single-file message has always looked like. */
const AttachmentRow: React.FC<{
  attachment: IAttachment;
  compact: boolean;
  onUnavailable?: () => void;
}> = ({ attachment, compact, onUnavailable }) => {
  const fileName = getAttachmentName(attachment);
  const kind = getFileKind(attachment.mimetype, fileName);

  // Optimistic attachment: the upload has not returned a URL yet, so every
  // renderer below would point at nothing. Show the file's identity instead.
  if (!attachment.location) {
    return (
      <FileDownload
        fileURL=""
        fileName={fileName}
        mimetype={attachment.mimetype}
        size={attachment.size}
      />
    );
  }

  switch (kind) {
    case 'image':
      return (
        <CustomMessageImage
          fileName={fileName}
          fileURL={attachment.location}
          mimetype={attachment.mimetype || ''}
          locationPreview={attachment.locationPreview}
          onUnavailable={onUnavailable}
        />
      );
    case 'video':
      return (
        <CustomMessageVideo
          fileName={fileName}
          fileURL={attachment.location}
          mimetype={attachment.mimetype || ''}
        />
      );
    case 'audio':
      return <AudioMessage src={attachment.location} />;
    case 'pdf':
      return (
        <PdfMessage
          fileURL={attachment.location}
          fileName={fileName}
          mimetype={attachment.mimetype}
          size={attachment.size}
          locationPreview={attachment.locationPreview}
          compact={compact}
        />
      );
    default:
      return (
        <FileDownload
          fileURL={attachment.location || ''}
          fileName={fileName}
          mimetype={attachment.mimetype}
          size={attachment.size}
          locationPreview={attachment.locationPreview}
        />
      );
  }
};

const StatusWrap = styled.div`
  position: relative;
  min-width: 0;
`;

const RetryHit = styled.button`
  position: absolute;
  inset: 0;
  z-index: 2;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  border-radius: var(--ethora-radius-md, 12px);

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: -2px;
  }
`;

/** A row renderer plus the upload/failed badge while the file is outgoing. */
const AttachmentRowWithStatus: React.FC<{
  attachment: IAttachment;
  compact: boolean;
  onUnavailable?: () => void;
  onRetry?: () => void;
}> = ({ attachment, compact, onUnavailable, onRetry }) => {
  const t = useT();
  if (!attachment.uploadStatus) {
    return (
      <AttachmentRow
        attachment={attachment}
        compact={compact}
        onUnavailable={onUnavailable}
      />
    );
  }
  const failed = attachment.uploadStatus === 'failed';
  return (
    <StatusWrap>
      <AttachmentRow attachment={attachment} compact={compact} onUnavailable={onUnavailable} />
      <MediaUploadOverlay
        status={attachment.uploadStatus}
        progress={attachment.uploadProgress}
      />
      {failed && onRetry && (
        <RetryHit
          type="button"
          onClick={onRetry}
          aria-label={t('attachment.retryUpload', {
            file: getAttachmentName(attachment),
          })}
        />
      )}
    </StatusWrap>
  );
};

interface AttachmentListProps {
  attachments: IAttachment[];
  /** See CustomMessageImage's `onUnavailable` - only wired to the full-width
   * single-image renderer (AttachmentRow), not the album tiles, since one
   * dead thumbnail there shouldn't tombstone a message that still has other
   * live attachments. */
  onUnavailable?: () => void;
  /** Re-sends the file at this index of `attachments` after a failed upload. */
  onRetryAttachment?: (index: number) => void;
}

const AttachmentList: React.FC<AttachmentListProps> = ({
  attachments,
  onUnavailable,
  onRetryAttachment,
}) => {
  const { tiles, rows } = useMemo(() => {
    const indexed: AlbumGridItem[] = attachments.map((attachment, index) => ({
      attachment,
      index,
    }));
    if (attachments.length < 2) {
      return { tiles: [] as AlbumGridItem[], rows: indexed };
    }

    const tileable: AlbumGridItem[] = [];
    const rowed: AlbumGridItem[] = [];

    indexed.forEach((item) => {
      const kind = getFileKind(
        item.attachment.mimetype,
        getAttachmentName(item.attachment)
      );
      if (kind === 'image' || kind === 'video') {
        tileable.push(item);
      } else {
        rowed.push(item);
      }
    });

    // A lone picture next to documents looks wrong in an album - give it the
    // normal renderer, in the order it was picked.
    if (tileable.length === 1) {
      return { tiles: [] as AlbumGridItem[], rows: indexed };
    }

    return { tiles: tileable, rows: rowed };
  }, [attachments]);

  if (attachments.length === 0) {
    return null;
  }

  const compact = attachments.length > 1;

  return (
    <AttachmentStack>
      {tiles.length > 0 && (
        <AlbumGrid items={tiles} onRetry={onRetryAttachment} />
      )}
      {rows.map(({ attachment, index }) => (
        <AttachmentRowWithStatus
          key={attachment.attachmentId || `${attachment.location}-${index}`}
          onUnavailable={onUnavailable}
          attachment={attachment}
          compact={compact}
          onRetry={onRetryAttachment ? () => onRetryAttachment(index) : undefined}
        />
      ))}
    </AttachmentStack>
  );
};

export default AttachmentList;

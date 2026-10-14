import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IAttachment, ModalFile } from '../../types/types';
import { getAttachmentName } from '../../helpers/attachments';
import { getFileKind } from '../../helpers/fileKind';
import {
  getMediaBlockMode,
  MediaBlockMode,
  partitionAttachments,
} from '../../helpers/mediaBubble';
import CustomMessageImage from '../styled/MessageImage';
import CustomMessageVideo from '../styled/VideoMessage';
import AudioMessage from '../styled/AudioMessage';
import PdfMessage from '../styled/PdfMessage';
import FileDownload from '../styled/UnsupportedType';
import MediaSurface from '../styled/MediaSurface';
import AlbumGrid from './AlbumGrid';
import { MediaUploadOverlay, SCRIM_FADE_MS } from './MediaUploadOverlay';
import styled from 'styled-components';
import { useT } from '../../i18n/useT';
import {
  FILE_ONLY_MAX_WIDTH_PX,
  MEDIA_WIDTH_CSS,
} from '../../helpers/mediaBox';

/** Full-width renderer: what a single-file message has always looked like. */
const AttachmentRow: React.FC<{
  attachment: IAttachment;
  compact: boolean;
}> = ({ attachment, compact }) => {
  const fileName = getAttachmentName(attachment);
  const kind = getFileKind(attachment.mimetype, fileName);

  // Optimistic attachment: the upload has not returned a URL yet, so every
  // renderer below would point at nothing. Show the file's identity instead.
  if (!attachment.location && !(kind === 'image' && attachment.localUrl)) {
    if (kind === 'image' || kind === 'video') {
      return (
        <MediaSurface
          kind={kind}
          variant="solo"
          src=""
          alt={fileName}
          mimetype={attachment.mimetype}
          dims={{ width: attachment.width, height: attachment.height }}
          pending
        />
      );
    }
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
          width={attachment.width}
          height={attachment.height}
          localUrl={attachment.localUrl}
        />
      );
    case 'video':
      return (
        <CustomMessageVideo
          fileName={fileName}
          fileURL={attachment.location}
          mimetype={attachment.mimetype || ''}
          duration={attachment.duration}
          width={attachment.width}
          height={attachment.height}
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
  max-width: 100%;
  border-radius: var(--ethora-radius-md, 12px);
  overflow: hidden;
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
  onRetry?: () => void;
}> = ({ attachment, compact, onRetry }) => {
  const t = useT();
  const status = attachment.uploadStatus;
  // Once a tile has been uploading, its wrapper stays for good so the
  // picture underneath is not remounted, and the scrim fades out instead of
  // snapping away when the upload finishes.
  const [wrapped, setWrapped] = useState(Boolean(status));
  const [leaving, setLeaving] = useState(false);
  const wasUploading = useRef(Boolean(status));
  useEffect(() => {
    if (status) {
      wasUploading.current = true;
      setWrapped(true);
      setLeaving(false);
      return;
    }
    if (!wasUploading.current) return;
    wasUploading.current = false;
    setLeaving(true);
    const timer = setTimeout(() => setLeaving(false), SCRIM_FADE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (!wrapped) {
    return (
      <AttachmentRow attachment={attachment} compact={compact} />
    );
  }
  const failed = status === 'failed';
  return (
    <StatusWrap>
      <AttachmentRow attachment={attachment} compact={compact} />
      {(status || leaving) && (
        <MediaUploadOverlay
          status={status ?? 'uploading'}
          progress={status ? attachment.uploadProgress : 100}
          leaving={!status}
        />
      )}
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

const MediaBlock = styled.div<{ $mode: MediaBlockMode; $cards: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 100%;
  box-sizing: border-box;
  ${({ $mode, $cards }) => {
    switch ($mode) {
      case 'album':
        return `width: ${MEDIA_WIDTH_CSS};`;
      case 'files':
        return `width: min(${MEDIA_WIDTH_CSS}, ${FILE_ONLY_MAX_WIDTH_PX}px);`;
      case 'solo':
        // A card under a tiny picture must still be readable. The block sits
        // centred so a tiny picture is centred in its minimum-width bubble.
        return `width: fit-content; max-width: min(100%, ${MEDIA_WIDTH_CSS}); align-self: center;${
          $cards ? ` min-width: min(100%, 240px);` : ''
        }`;
      default:
        return '';
    }
  }}
`;

interface AttachmentListProps {
  attachments: IAttachment[];
  /** Re-sends the file at this index of `attachments` after a failed upload. */
  onRetryAttachment?: (index: number) => void;
  /** Who posted the message and when; the viewer header shows both. */
  sender?: ModalFile['sender'];
  date?: string;
}

const AttachmentList: React.FC<AttachmentListProps> = ({
  attachments,
  onRetryAttachment,
  sender,
  date,
}) => {
  const { tiles, rows } = useMemo(
    () => partitionAttachments(attachments),
    [attachments]
  );

  if (attachments.length === 0) {
    return null;
  }

  const compact = attachments.length > 1;
  const hasCards = rows.some(({ attachment }) => {
    const kind = getFileKind(attachment.mimetype, getAttachmentName(attachment));
    return kind !== 'image' && kind !== 'video' && kind !== 'audio';
  });
  const mode = getMediaBlockMode(attachments);

  return (
    <MediaBlock $mode={mode} $cards={hasCards} data-testid="media-block" data-mode={mode}>
      {tiles.length > 0 && (
        <AlbumGrid
          items={tiles}
          onRetry={onRetryAttachment}
          sender={sender}
          date={date}
        />
      )}
      {rows.map(({ attachment, index }) => (
        <AttachmentRowWithStatus
          key={
            attachment.localUrl ||
            attachment.attachmentId ||
            `${attachment.location}-${index}`
          }
          attachment={attachment}
          compact={compact}
          onRetry={onRetryAttachment ? () => onRetryAttachment(index) : undefined}
        />
      ))}
    </MediaBlock>
  );
};

export default AttachmentList;

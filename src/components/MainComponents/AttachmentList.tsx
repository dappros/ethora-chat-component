import React, { useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { IAttachment } from '../../types/types';
import { getAttachmentName } from '../../helpers/attachments';
import { getFileKind } from '../../helpers/fileKind';
import {
  AttachmentGrid,
  AttachmentStack,
  AttachmentTile,
  PdfThumbnailSkeleton,
} from '../styled/StyledInputComponents/MediaComponents';
import {
  setActiveFile,
  setActiveModal,
} from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import CustomMessageImage from '../styled/MessageImage';
import CustomMessageVideo from '../styled/VideoMessage';
import AudioMessage from '../styled/AudioMessage';
import PdfMessage from '../styled/PdfMessage';
import FileDownload from '../styled/UnsupportedType';

const IMAGE_FALLBACK =
  'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';

/**
 * One tile inside a multi-file message. Images and videos collapse to a
 * square crop so a mixed group still reads as a grid; everything else keeps
 * its own row renderer, just denser.
 */
const AttachmentTileItem: React.FC<{ attachment: IAttachment }> = ({
  attachment,
}) => {
  const dispatch = useDispatch();
  const fileName = getAttachmentName(attachment);
  const kind = getFileKind(attachment.mimetype, fileName);

  const handleOpen = useCallback(() => {
    if (!attachment.location) return;
    dispatch(
      setActiveFile({
        fileName,
        fileURL: attachment.location,
        mimetype: attachment.mimetype || '',
      })
    );
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  }, [attachment.location, attachment.mimetype, dispatch, fileName]);

  // Still uploading: no URL to point at yet.
  if (!attachment.location) {
    return (
      <AttachmentTile disabled aria-label={fileName}>
        <PdfThumbnailSkeleton />
      </AttachmentTile>
    );
  }

  return (
    <AttachmentTile onClick={handleOpen} title={fileName}>
      {kind === 'video' ? (
        <video src={attachment.location} preload="metadata" muted />
      ) : (
        <img
          src={attachment.locationPreview || attachment.location}
          alt={fileName}
          onError={(event) => {
            (event.target as HTMLImageElement).src = IMAGE_FALLBACK;
          }}
        />
      )}
    </AttachmentTile>
  );
};

/** Full-width renderer: what a single-file message has always looked like. */
const AttachmentRow: React.FC<{
  attachment: IAttachment;
  compact: boolean;
}> = ({ attachment, compact }) => {
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

interface AttachmentListProps {
  attachments: IAttachment[];
}

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments }) => {
  const { tiles, rows } = useMemo(() => {
    if (attachments.length < 2) {
      return { tiles: [] as IAttachment[], rows: attachments };
    }

    const tileable: IAttachment[] = [];
    const rowed: IAttachment[] = [];

    attachments.forEach((attachment) => {
      const kind = getFileKind(
        attachment.mimetype,
        getAttachmentName(attachment)
      );
      if (kind === 'image' || kind === 'video') {
        tileable.push(attachment);
      } else {
        rowed.push(attachment);
      }
    });

    // A lone picture next to documents looks wrong cropped into a square -
    // give it the normal renderer and let the documents stack under it.
    if (tileable.length === 1) {
      return { tiles: [], rows: [...tileable, ...rowed] };
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
        <AttachmentGrid $columns={Math.min(tiles.length, tiles.length === 3 ? 3 : 2)}>
          {tiles.map((attachment, index) => (
            <AttachmentTileItem
              key={attachment.attachmentId || `${attachment.location}-${index}`}
              attachment={attachment}
            />
          ))}
        </AttachmentGrid>
      )}
      {rows.map((attachment, index) => (
        <AttachmentRow
          key={attachment.attachmentId || `${attachment.location}-${index}`}
          attachment={attachment}
          compact={compact}
        />
      ))}
    </AttachmentStack>
  );
};

export default AttachmentList;

import React, { useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { useDispatch } from 'react-redux';
import { IAttachment } from '../../types/types';
import { getAttachmentName } from '../../helpers/attachments';
import { getFileKind } from '../../helpers/fileKind';
import { getAlbumLayout } from '../../helpers/albumLayout';
import { setActiveFile, setActiveModal } from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { useT } from '../../i18n/useT';
import { MediaUploadOverlay } from './MediaUploadOverlay';

const IMAGE_FALLBACK =
  'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';

const GRID_GAP_PX = 4;

const Grid = styled.div<{
  $columns: string;
  $rows: string;
  $aspectRatio: string;
}>`
  display: grid;
  grid-template-columns: ${({ $columns }) => $columns};
  grid-template-rows: ${({ $rows }) => $rows};
  aspect-ratio: ${({ $aspectRatio }) => $aspectRatio};
  gap: ${GRID_GAP_PX}px;
  width: 100%;
  max-width: 360px;
  min-width: 0;
  box-sizing: border-box;
  border-radius: var(--ethora-radius-md, 12px);
  overflow: hidden;
`;

const Tile = styled.button<{ $dimmed: boolean }>`
  position: relative;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  cursor: ${({ $dimmed }) => ($dimmed ? 'default' : 'pointer')};
  background: var(--ethora-color-bg-subtle, #eef2f8);

  img,
  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: -2px;
  }
`;

const MoreOverlay = styled.span`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(9, 16, 32, 0.55);
  color: #fff;
  font-size: var(--ethora-font-size-xl, 22px);
  font-weight: 600;
  pointer-events: none;
`;

export interface AlbumGridItem {
  attachment: IAttachment;
  /** Position in the message's `attachments`, used for retry. */
  index: number;
}

interface AlbumGridProps {
  items: AlbumGridItem[];
  /** Called with the failed tile's index when the user asks to retry it. */
  onRetry?: (index: number) => void;
}

/**
 * Photo/video album for a message with several media files. Layout comes
 * from getAlbumLayout; a tile tap opens that file in the preview modal, and
 * a tile still in flight or failed shows its state over the thumbnail.
 */
const AlbumGrid: React.FC<AlbumGridProps> = ({ items, onRetry }) => {
  const t = useT();
  const dispatch = useDispatch();
  const layout = useMemo(() => getAlbumLayout(items.length), [items.length]);
  const visibleItems = items.slice(0, layout.visible);

  const openAttachment = useCallback(
    (attachment: IAttachment, fileName: string) => {
      if (!attachment.location) return;
      dispatch(
        setActiveFile({
          fileName,
          fileURL: attachment.location,
          mimetype: attachment.mimetype || '',
        })
      );
      dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
    },
    [dispatch]
  );

  return (
    <Grid
      $columns={layout.columns}
      $rows={layout.rows}
      $aspectRatio={layout.aspectRatio}
      data-testid="album-grid"
      data-layout={layout.kind}
    >
      {visibleItems.map(({ attachment, index }, position) => {
        const fileName = getAttachmentName(attachment);
        const kind = getFileKind(attachment.mimetype, fileName);
        const cell = layout.placements[position];
        const failed = attachment.uploadStatus === 'failed';
        const pending = attachment.uploadStatus === 'uploading';
        const showMore = position === layout.visible - 1 && layout.hidden > 0;
        const dimmed = pending || (!failed && !attachment.location);

        const handleClick = () => {
          if (failed) {
            onRetry?.(index);
            return;
          }
          if (dimmed) return;
          openAttachment(attachment, fileName);
        };

        const label = failed
          ? t('attachment.retryUpload', { file: fileName })
          : fileName;

        return (
          <Tile
            key={attachment.attachmentId || `${index}-${fileName}`}
            type="button"
            $dimmed={dimmed && !failed}
            aria-label={label}
            title={fileName}
            disabled={dimmed && !failed}
            onClick={handleClick}
            style={{ gridColumn: cell.column, gridRow: cell.row }}
          >
            {attachment.location ? (
              kind === 'video' ? (
                <video src={attachment.location} preload="metadata" muted />
              ) : (
                <img
                  src={attachment.locationPreview || attachment.location}
                  alt={fileName}
                  onError={(event) => {
                    (event.target as HTMLImageElement).src = IMAGE_FALLBACK;
                  }}
                />
              )
            ) : null}
            {pending && (
              <MediaUploadOverlay
                status="uploading"
                progress={attachment.uploadProgress}
              />
            )}
            {failed && <MediaUploadOverlay status="failed" />}
            {showMore && <MoreOverlay>{t('attachment.moreCount', { count: layout.hidden })}</MoreOverlay>}
          </Tile>
        );
      })}
    </Grid>
  );
};

export default AlbumGrid;

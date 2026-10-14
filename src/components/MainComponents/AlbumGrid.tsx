import React, { useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { useDispatch } from 'react-redux';
import { IAttachment, ModalFile } from '../../types/types';
import { getAttachmentName } from '../../helpers/attachments';
import { getFileKind } from '../../helpers/fileKind';
import {
  ALBUM_GAP_PX,
  getAlbumLayout,
  getTileBorderRadius,
} from '../../helpers/albumLayout';
import { setActiveFile, setActiveModal } from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { useT } from '../../i18n/useT';
import MediaSurface from '../styled/MediaSurface';
import { MediaUploadOverlay, RetryIcon } from './MediaUploadOverlay';

const ALBUM_PREFERRED_WIDTH_PX = 360;
const ALBUM_MAX_WIDTH_PX = 480;

const Grid = styled.div<{
  $columns: string;
  $rows: string;
  $aspectRatio: string;
}>`
  display: grid;
  grid-template-columns: ${({ $columns }) => $columns};
  grid-template-rows: ${({ $rows }) => $rows};
  aspect-ratio: ${({ $aspectRatio }) => $aspectRatio};
  gap: ${ALBUM_GAP_PX}px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
`;

/**
 * Sizes the album. The bubble shrink-wraps its content, and a percentage
 * width contributes nothing to that, so the `::before` sizer carries a
 * definite preferred width (360px) and the box then stretches to whatever
 * width the bubble actually has, capped at 480px. Album-only: the bubble
 * wraps the album at 360px (or its own max-width on a phone). Wider because
 * of a caption or name: the album grows with it, up to the cap.
 */
const AlbumBox = styled.div`
  align-self: stretch;
  width: 100%;
  min-width: 0;
  max-width: ${ALBUM_MAX_WIDTH_PX}px;

  &::before {
    content: '';
    display: block;
    width: ${ALBUM_PREFERRED_WIDTH_PX}px;
    max-width: 100%;
    height: 0;
  }
`;

const Tile = styled.button<{ $dimmed: boolean; $radius: string }>`
  position: relative;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  isolation: isolate;
  border-radius: ${({ $radius }) => $radius};
  cursor: ${({ $dimmed }) => ($dimmed ? 'default' : 'pointer')};
  background: var(--ethora-color-bg-subtle, #f3f6fc);

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const MoreOverlay = styled.span<{ $failed: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #fff;
  background: ${({ $failed }) =>
    $failed
      ? 'color-mix(in srgb, var(--ethora-color-danger, #d02b1f) 55%, rgba(9, 16, 32, 0.2))'
      : 'rgba(8, 12, 24, 0.22)'};
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.35);
  pointer-events: none;
`;

const MoreRetryBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  text-shadow: none;
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
  /** Who posted the album and when, handed to the viewer header. */
  sender?: ModalFile['sender'];
  date?: string;
}

/**
 * Photo/video album for a message with several media files. Layout comes
 * from getAlbumLayout; a tile tap opens that file in the preview modal, and
 * a tile still in flight or failed shows its state over the thumbnail.
 */
const AlbumGrid: React.FC<AlbumGridProps> = ({ items, onRetry, sender, date }) => {
  const t = useT();
  const dispatch = useDispatch();
  const layout = useMemo(() => getAlbumLayout(items.length), [items.length]);
  const visibleItems = items.slice(0, layout.visible);
  // Failed files folded behind the "+N" cell. They have no tile of their own,
  // so the +N cell is the only way to reach them from the grid.
  const hiddenFailedIndices = useMemo(
    () =>
      items
        .slice(layout.visible)
        .filter(({ attachment }) => attachment.uploadStatus === 'failed')
        .map(({ index }) => index),
    [items, layout.visible]
  );

  // Every openable item, so the viewer can page through the whole album even
  // when the room's loaded messages do not carry it.
  const siblings = useMemo(
    () =>
      items
        .filter(({ attachment }) => Boolean(attachment.location))
        .map(({ attachment }) => ({
          fileName: getAttachmentName(attachment),
          fileURL: attachment.location,
          mimetype: attachment.mimetype || '',
          previewURL: attachment.locationPreview || undefined,
          sender,
          date,
        })),
    [items, sender, date]
  );

  const openAttachment = useCallback(
    (attachment: IAttachment, fileName: string) => {
      if (!attachment.location) return;
      dispatch(
        setActiveFile({
          fileName,
          fileURL: attachment.location,
          mimetype: attachment.mimetype || '',
          sender,
          date,
          siblings,
        })
      );
      dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
    },
    [dispatch, siblings]
  );

  return (
    <AlbumBox>
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
        const radius = getTileBorderRadius(layout, position);
        const failed = attachment.uploadStatus === 'failed';
        const pending = attachment.uploadStatus === 'uploading';
        const showMore = position === layout.visible - 1 && layout.hidden > 0;
        // Only the +N cell can stand for hidden failures; any other cell keeps
        // its own behaviour.
        const moreFailed = showMore && hiddenFailedIndices.length > 0;
        const dimmed = pending || (!failed && !attachment.location);
        const inert = dimmed && !failed && !moreFailed;
        const isVideo = kind === 'video';

        const handleClick = () => {
          if (moreFailed) {
            // Retry the tile's own failure too, if it has one, then every
            // hidden failure. Each goes through the same per-index callback.
            if (failed) onRetry?.(index);
            hiddenFailedIndices.forEach((hiddenIndex) => onRetry?.(hiddenIndex));
            return;
          }
          if (failed) {
            onRetry?.(index);
            return;
          }
          if (dimmed) return;
          openAttachment(attachment, fileName);
        };

        const label = moreFailed
          ? t('attachment.hiddenFailed', { count: hiddenFailedIndices.length })
          : failed
            ? t('attachment.retryUpload', { file: fileName })
            : fileName;

        return (
          <Tile
            key={attachment.attachmentId || `${index}-${fileName}`}
            type="button"
            $dimmed={inert}
            $radius={radius}
            aria-label={label}
            title={fileName}
            disabled={inert}
            onClick={handleClick}
            style={{ gridColumn: cell.column, gridRow: cell.row }}
          >
            <MediaSurface
              kind={isVideo ? 'video' : 'image'}
              src={attachment.location || ''}
              previewSrc={attachment.locationPreview}
              alt={fileName}
              variant="fill"
              duration={attachment.duration}
              pending={pending}
              radius={radius}
              interactive={!inert && !failed && !showMore}
              blurred={showMore}
              chrome={!showMore}
            />
            {pending && (
              <MediaUploadOverlay
                status="uploading"
                progress={attachment.uploadProgress}
              />
            )}
            {failed && <MediaUploadOverlay status="failed" />}
            {showMore && (
              <MoreOverlay $failed={moreFailed}>
                <span>{t('attachment.moreCount', { count: layout.hidden })}</span>
                {moreFailed && (
                  <MoreRetryBadge>
                    <RetryIcon size={14} />
                  </MoreRetryBadge>
                )}
              </MoreOverlay>
            )}
          </Tile>
        );
      })}
    </Grid>
    </AlbumBox>
  );
};

export default AlbumGrid;

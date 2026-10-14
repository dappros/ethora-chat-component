import { safeImageUrl } from '../../helpers/safeUrl';
import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import styled from 'styled-components';
import { PdfThumbnailSkeleton } from './StyledInputComponents/MediaComponents';
import {
  setActiveFile,
  setActiveModal,
} from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { PdfIcon } from '../../assets/icons';
import { formatFileName, formatFileSize } from '../../helpers/fileKind';
import { useInView } from '../../hooks/useInView';
import { usePdfThumbnail } from '../../hooks/usePdfThumbnail';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT } from '../../i18n/useT';
import FileCard from './FileCard';

const Thumb = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
`;

interface PdfMessageProps {
  fileURL: string;
  fileName: string;
  mimetype?: string;
  size?: string;
  /** Server-side preview, when the storage produced one. Wins over pdf.js. */
  locationPreview?: string;
  /** Denser layout used when the message carries more than one file. */
  compact?: boolean;
}

const DEFAULT_MAX_PREVIEW_MB = 25;

const PdfMessage: React.FC<PdfMessageProps> = ({
  fileURL,
  fileName,
  mimetype = 'application/pdf',
  size,
  locationPreview,
  compact = false,
}) => {
  const dispatch = useDispatch();
  const t = useT();
  const { config } = useChatSettingState();
  const { ref, inView } = useInView<HTMLButtonElement>();

  const previewConfig = config?.pdfPreview;
  const previewEnabled = previewConfig?.enabled !== false;
  const sizeInBytes = Number.parseInt(String(size ?? ''), 10);

  const { status, thumbnailUrl } = usePdfThumbnail({
    // A server-rendered preview is already an image: never pay for pdf.js.
    url: locationPreview ? undefined : fileURL,
    enabled: previewEnabled && inView && !!fileURL,
    width: compact ? 132 : 252,
    sizeInBytes: Number.isFinite(sizeInBytes) ? sizeInBytes : undefined,
    maxBytes:
      (previewConfig?.maxFileSizeMb ?? DEFAULT_MAX_PREVIEW_MB) * 1024 * 1024,
    workerSrc: previewConfig?.workerSrc,
    libUrl: previewConfig?.libUrl,
  });

  const handleOpen = useCallback(() => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  }, [dispatch, fileName, fileURL, mimetype]);

  const previewSrc = locationPreview || thumbnailUrl;
  const isRendering = !previewSrc && status === 'loading';
  const formattedSize = formatFileSize(size);

  return (
    <FileCard
      ref={ref}
      name={formatFileName(fileName, 60)}
      meta={['PDF', formattedSize || undefined]}
      tone="pdf"
      compact={compact}
      onOpen={handleOpen}
      title={fileName}
      aria-label={fileName}
      icon={
        previewSrc ? (
          <Thumb src={safeImageUrl(previewSrc)} alt="" />
        ) : isRendering ? (
          <PdfThumbnailSkeleton />
        ) : (
          <PdfIcon width={24} height={24} aria-hidden="true" />
        )
      }
    />
  );
};

export default PdfMessage;

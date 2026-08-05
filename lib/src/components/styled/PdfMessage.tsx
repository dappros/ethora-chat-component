import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import {
  FileName,
  FileSize,
  FileSizeContainer,
  PdfBadge,
  PdfContainer,
  PdfInformation,
  PdfMetaRow,
  PdfThumbnailFrame,
  PdfThumbnailSkeleton,
} from './StyledInputComponents/MediaComponents';
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

  const { status, thumbnailUrl, pageCount } = usePdfThumbnail({
    // A server-rendered preview is already an image: never pay for pdf.js.
    url: locationPreview ? undefined : fileURL,
    enabled: previewEnabled && inView && !!fileURL,
    width: compact ? 132 : 252,
    sizeInBytes: Number.isFinite(sizeInBytes) ? sizeInBytes : undefined,
    maxBytes:
      (previewConfig?.maxFileSizeMb ?? DEFAULT_MAX_PREVIEW_MB) * 1024 * 1024,
    workerSrc: previewConfig?.workerSrc,
  });

  const handleOpen = useCallback(() => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  }, [dispatch, fileName, fileURL, mimetype]);

  const previewSrc = locationPreview || thumbnailUrl;
  const isRendering = !previewSrc && status === 'loading';
  const formattedSize = formatFileSize(size);

  return (
    <PdfContainer
      ref={ref}
      $compact={compact}
      onClick={handleOpen}
      title={fileName}
    >
      <PdfThumbnailFrame $compact={compact}>
        {previewSrc ? (
          <img src={previewSrc} alt={fileName} />
        ) : isRendering ? (
          <PdfThumbnailSkeleton />
        ) : (
          <PdfIcon
            width={compact ? 32 : 44}
            height={compact ? 32 : 44}
            aria-hidden="true"
          />
        )}
      </PdfThumbnailFrame>
      <PdfInformation>
        <FileName>{formatFileName(fileName, compact ? 22 : 28)}</FileName>
        <PdfMetaRow>
          <PdfBadge>PDF</PdfBadge>
          {formattedSize && (
            <FileSizeContainer>
              <FileSize>{formattedSize}</FileSize>
            </FileSizeContainer>
          )}
          {!!pageCount && (
            <FileSizeContainer>
              <FileSize>{t('attachment.pages', { count: pageCount })}</FileSize>
            </FileSizeContainer>
          )}
        </PdfMetaRow>
      </PdfInformation>
    </PdfContainer>
  );
};

export default PdfMessage;

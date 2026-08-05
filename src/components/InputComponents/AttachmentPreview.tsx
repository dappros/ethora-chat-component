import React from 'react';
import {
  DocumentPreview,
  FilePreview,
  FilePreviewName,
  ImagePreview,
  VideoPreview,
} from '../styled/StyledInputComponents/StyledInputComponents';
import Button from '../styled/Button';
import { FileIcon, PdfIcon, RemoveIcon } from '../../assets/icons';
import { IConfig } from '../../types/types';
import {
  resolveIconBgColor,
  resolveIconColor,
} from '../../helpers/resolveIconColor';
import { getFileKind } from '../../helpers/fileKind';
import { usePdfThumbnail } from '../../hooks/usePdfThumbnail';

interface AttachmentPreviewProps {
  file: File;
  /** Blob URL for this file, owned by the composer. */
  objectUrl?: string;
  onRemove: (file: File) => void;
  config?: IConfig;
  removeLabel?: string;
}

const removeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  backgroundColor: 'transparent',
  top: 4,
  right: 4,
  height: 16,
  width: 16,
  zIndex: 1,
};

/**
 * One picked-but-not-yet-sent file. PDFs get the same first-page render the
 * bubble does - the file is already local, so it costs one blob read and
 * makes "did I attach the right document?" answerable before sending.
 */
const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  file,
  objectUrl,
  onRemove,
  config,
  removeLabel,
}) => {
  const kind = getFileKind(file.type, file.name);

  const { thumbnailUrl } = usePdfThumbnail({
    url: kind === 'pdf' ? objectUrl : undefined,
    enabled: kind === 'pdf' && config?.pdfPreview?.enabled !== false,
    width: 200,
    sizeInBytes: file.size,
    workerSrc: config?.pdfPreview?.workerSrc,
  });

  const renderBody = () => {
    if (kind === 'image' && objectUrl) {
      return <ImagePreview src={objectUrl} alt={file.name} />;
    }
    if (kind === 'video' && objectUrl) {
      return <VideoPreview src={objectUrl} controls />;
    }
    if (kind === 'pdf') {
      return thumbnailUrl ? (
        <DocumentPreview src={thumbnailUrl} alt={file.name} />
      ) : (
        <PdfIcon />
      );
    }
    return (
      <FileIcon
        alt={file.name}
        color={resolveIconColor(config)}
        fill={resolveIconBgColor(config)}
      />
    );
  };

  return (
    <FilePreview title={file.name}>
      {renderBody()}
      <FilePreviewName>{file.name}</FilePreviewName>
      <Button
        style={removeButtonStyle}
        onClick={() => onRemove(file)}
        aria-label={removeLabel}
        EndIcon={<RemoveIcon style={{ height: 16, width: 16 }} />}
      />
    </FilePreview>
  );
};

export default AttachmentPreview;

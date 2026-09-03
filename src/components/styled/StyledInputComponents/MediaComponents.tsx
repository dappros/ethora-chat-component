import styled, { keyframes } from 'styled-components';

const shimmer = keyframes`
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
`;

export const MediaLoadingSkeleton = styled.div<{
  $width?: number | string;
  $height?: number | string;
}>`
  width: ${({ $width }) => (typeof $width === 'number' ? `${$width}px` : $width || '150px')};
  height: ${({ $height }) => (typeof $height === 'number' ? `${$height}px` : $height || '150px')};
  max-width: 100%;
  border-radius: 16px;
  background-color: #f3f6fc;
  animation: ${shimmer} 1.4s ease-in-out infinite;
`;

export const Container = styled.div`
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const FullScreenImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

export const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 10px;
`;

export const ButtonContainer = styled.div`
  display: flex;
  position: absolute;
  top: 8px;
  right: 8px;
  gap: 4px;
`;

export const IconButton = styled.button`
  border: none;
  cursor: pointer;
  color: gray;
  font-size: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
`;

export const UnsupportedContainer = styled.button`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  gap: 8px;
  background-color: #f3f6fc;
  border: none;
`;

export const BackgroundFile = styled.div`
  border-radius: 8px;
  width: 100%;
  height: 100%;
  background-color: #fff;
`;

export const FileInformation = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

export const FileName = styled.span`
  font-size: 14px;
  font-weight: 500;
  flex-grow: 1;
  color: #141414;
  overflow: hidden;
  min-width: 100px;
  text-align: start;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

export const FileSizeContainer = styled.div`
  align-items: flex-start;
  flex-direction: row;
  background-color: #fff;
  padding: 2px 8px;
  border-radius: 40px;
`;

export const FileSize = styled.span`
  color: #53575a;
  overflow: hidden;
  text-align: left;
  font-weight: 500;
`;

/* ---------------------------------------------------------------- *
 * Multi-attachment layout
 * ---------------------------------------------------------------- */

/** Wraps every attachment of one message. Single-file messages keep the
 *  old, un-gapped look because there is nothing to separate them from. */
export const AttachmentStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
`;

export const AttachmentGrid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr));
  gap: 4px;
  max-width: 100%;
`;

export const AttachmentTile = styled.button`
  position: relative;
  padding: 0;
  border: none;
  cursor: pointer;
  overflow: hidden;
  border-radius: 12px;
  background-color: rgba(0, 0, 0, 0.04);
  aspect-ratio: 1 / 1;
  width: 100%;

  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

/* ---------------------------------------------------------------- *
 * PDF card
 * ---------------------------------------------------------------- */

export const PdfContainer = styled.button<{ $compact: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: ${({ $compact }) => ($compact ? '6px 8px' : '8px 10px')};
  border: none;
  border-radius: 8px;
  cursor: pointer;
  background-color: #f3f6fc;
  text-align: start;
`;

export const PdfThumbnailFrame = styled.div<{ $compact: boolean }>`
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 6px;
  background-color: #fff;
  border: 1px solid #e4e9f2;
  width: ${({ $compact }) => ($compact ? '44px' : '84px')};
  height: ${({ $compact }) => ($compact ? '56px' : '110px')};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    display: block;
  }
`;

/** Sits on the thumbnail while pdf.js parses so the row does not pop in. */
export const PdfThumbnailSkeleton = styled.div`
  width: 100%;
  height: 100%;
  background: linear-gradient(100deg, #f2f4f8 30%, #e7ebf2 50%, #f2f4f8 70%);
  background-size: 200% 100%;
  animation: ethora-pdf-shimmer 1.2s ease-in-out infinite;

  @keyframes ethora-pdf-shimmer {
    from {
      background-position: 160% 0;
    }
    to {
      background-position: -60% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const PdfInformation = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
`;

export const PdfMetaRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

export const PdfBadge = styled.span`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #d93025;
  background-color: #fdecec;
  border-radius: 4px;
  padding: 1px 5px;
`;

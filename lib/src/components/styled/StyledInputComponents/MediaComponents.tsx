import React from 'react';
import styled, { css, keyframes } from 'styled-components';
import { reducedMotion, shimmerBackground } from '../../../styles/motion';

/**
 * Loading spinner rules shared by the media loading states. The spinner is
 * a fixed-pixel circle with `flex: none`, so a flex parent (the upload scrim,
 * a tiny album tile) cannot squash it into an oval. Whether it is drawn at
 * all is decided by a container query on the box it sits in, see below.
 */
export const MEDIA_SPINNER_PX = 24;
/** Boxes smaller than this (on either side) get the shimmer only, no spinner. */
export const MEDIA_SPINNER_MIN_BOX_PX = 48;
const DEFAULT_MEDIA_ASPECT_RATIO = '3 / 4';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const spinnerBase = css`
  box-sizing: border-box;
  flex: none;
  width: ${MEDIA_SPINNER_PX}px;
  height: ${MEDIA_SPINNER_PX}px;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  border: 3px solid var(--ethora-color-border, #d9dee7);
  border-top-color: var(--ethora-color-primary, #0052cd);
  animation: ${spin} 0.9s linear infinite;
  ${reducedMotion}
`;

/**
 * Loading placeholder for a media bubble that is still downloading. A rounded
 * rectangle with the shimmer, sized by its real aspect ratio when the width
 * and height are known (default 3:4 otherwise). The spinner is a child
 * element, not a pseudo element: a container query never matches its own
 * container from a ::after, so the spinner must sit inside the box.
 */
const SkeletonBox = styled.div<{ $width?: number; $height?: number }>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ $width }) => ($width ? `${$width}px` : '150px')};
  max-width: 100%;
  aspect-ratio: ${({ $width, $height }) =>
    $width && $height ? `${$width} / ${$height}` : DEFAULT_MEDIA_ASPECT_RATIO};
  /* Lets the spinner's container query measure this box, not the viewport. */
  position: relative;
  container-type: size;
  border-radius: var(--ethora-radius-md, 16px);
  ${shimmerBackground}
`;

export const MediaLoadingSkeleton: React.FC<{ $width?: number; $height?: number }> = ({
  $width,
  $height,
}) => (
  <SkeletonBox $width={$width} $height={$height}>
    <MediaSpinner aria-hidden="true" />
  </SkeletonBox>
);

/** Standalone spinner for a loading overlay. Hidden inside boxes under the min size. */
export const MediaSpinner = styled.span`
  display: none;
  ${spinnerBase}

  @container (min-width: ${MEDIA_SPINNER_MIN_BOX_PX}px) and (min-height: ${MEDIA_SPINNER_MIN_BOX_PX}px) {
    display: block;
  }
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
  color: var(--ethora-color-icons, gray);
  font-size: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
  border-radius: var(--ethora-radius-sm, 8px);
  transition: background-color var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, ease);

  &:hover {
    background-color: var(--ethora-color-bg-hover, rgba(0, 0, 0, 0.06));
  }
`;

export const UnsupportedContainer = styled.button`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-radius: var(--ethora-radius-sm, 8px);
  padding: 8px 10px;
  cursor: pointer;
  gap: 8px;
  background-color: var(--ethora-color-bg-subtle, #f3f6fc);
  border: 1px solid var(--ethora-color-border, transparent);
`;

export const BackgroundFile = styled.div`
  border-radius: var(--ethora-radius-sm, 8px);
  width: 100%;
  height: 100%;
  background-color: var(--ethora-color-bg, #fff);
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
  color: var(--ethora-color-text, #141414);
  overflow: hidden;
  min-width: 100px;
  text-align: start;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

export const FileSizeContainer = styled.div`
  align-items: flex-start;
  flex-direction: row;
  background-color: var(--ethora-color-bg, #fff);
  padding: 2px 8px;
  border-radius: var(--ethora-radius-full, 40px);
`;

export const FileSize = styled.span`
  color: var(--ethora-color-text-secondary, #53575a);
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
  border: 1px solid var(--ethora-color-border, transparent);
  cursor: pointer;
  overflow: hidden;
  border-radius: var(--ethora-radius-md, 12px);
  background-color: var(--ethora-color-bg-subtle, rgba(0, 0, 0, 0.04));
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
  border: 1px solid var(--ethora-color-border, transparent);
  border-radius: var(--ethora-radius-sm, 8px);
  cursor: pointer;
  background-color: var(--ethora-color-bg-subtle, #f3f6fc);
  text-align: start;
`;

export const PdfThumbnailFrame = styled.div<{ $compact: boolean }>`
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--ethora-radius-sm, 6px);
  background-color: var(--ethora-color-bg, #fff);
  border: 1px solid var(--ethora-color-border, #e4e9f2);
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
  position: relative;
  width: 100%;
  height: 100%;
  ${shimmerBackground}
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
  color: var(--ethora-color-danger, #d93025);
  background-color: #fdecec;
  [data-ethora-color-scheme='dark'] & {
    background-color: rgba(242, 118, 107, 0.15);
  }
  border-radius: var(--ethora-radius-sm, 4px);
  padding: 1px 5px;
`;

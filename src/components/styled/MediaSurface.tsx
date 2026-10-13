import React, { useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { ImageUnavailableState } from '../MainComponents/ImageUnavailable';
import { useMediaProbe } from '../../hooks/useMediaProbe';
import { reducedMotion, shimmerBackground } from '../../styles/motion';
import {
  fitMediaBox,
  formatDuration,
  parseDimension,
  SOLO_DEFAULT_BOX,
  SOLO_VIDEO_DEFAULT_BOX,
} from '../../helpers/mediaBox';

/** Image reveal once the full file is decoded. */
const FADE_IN_MS = 180;

const revealIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

/**
 * Hairline drawn over the media edge. It sits in an ::after so it paints
 * above the image; the stage clips it to the same radius.
 */
const hairline = css`
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    box-shadow: inset 0 0 0 1px rgba(16, 24, 40, 0.1);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ethora-color-text, #141414) 12%, transparent);
  }
`;

/** Pointer-only zoom: a 1.03 scale of the full image on hover. */
const hoverZoom = css`
  [data-media-layer='full'] {
    transition: transform ${FADE_IN_MS}ms ease;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover [data-media-layer='full'] {
      transform: scale(1.03);
    }
  }
`;

interface StageProps {
  $variant: 'fill' | 'solo';
  $radius: string;
  /** Pointer cursor for a clickable item; zoom-in when it is an image. */
  $cursor: string;
  /** Hover zoom on the full image, for clickable images only. */
  $zoom: boolean;
  /** Blur and dim the picture behind the "+N" count. */
  $blurred: boolean;
}

/** The clipped box every media state is drawn into. */
const Stage = styled.div<StageProps>`
  position: ${({ $variant }) => ($variant === 'fill' ? 'absolute' : 'relative')};
  ${({ $variant }) =>
    $variant === 'fill'
      ? 'inset: 0;'
      : 'display: block; max-width: 100%; box-sizing: border-box;'}
  overflow: hidden;
  isolation: isolate;
  border-radius: ${({ $radius }) => $radius};
  background-color: var(--ethora-color-bg-subtle, #f3f6fc);
  cursor: ${({ $cursor }) => $cursor};
  ${hairline}
  ${({ $zoom }) => ($zoom ? hoverZoom : '')}
  ${({ $blurred }) =>
    $blurred
      ? css`
          & [data-media-layer] {
            filter: blur(8px) brightness(0.72);
            transform: scale(1.08);
          }
        `
      : ''}
`;

/** Button wrapper for a solo media item, so a click or key opens the preview. */
const SoloTrigger = styled.button`
  display: block;
  max-width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: start;
  cursor: inherit;
  border-radius: var(--ethora-radius-md, 14px);

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const Skeleton = styled.div<{ $shimmer: boolean }>`
  position: absolute;
  inset: 0;
  ${({ $shimmer }) =>
    $shimmer
      ? shimmerBackground
      : css`
          background-color: var(--ethora-color-bg-subtle, #f3f6fc);
        `}
`;

const Layer = styled.img`
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const PreviewLayer = styled(Layer)<{ $blurred: boolean }>`
  ${({ $blurred }) =>
    $blurred
      ? css`
          filter: blur(14px) saturate(1.05);
          transform: scale(1.08);
        `
      : ''}
`;

const FullLayer = styled(Layer)`
  animation: ${revealIn} ${FADE_IN_MS}ms ease both;
  ${reducedMotion}
`;

const VideoLayerEl = styled.video<{ $ready: boolean }>`
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: ${({ $ready }) => ($ready ? 1 : 0)};
  transition: opacity ${FADE_IN_MS}ms ease;
  ${reducedMotion}
`;

/** Frosted circle with a play triangle, centred on a video. */
export const PlayBadge = styled.span`
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.45);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  backdrop-filter: blur(10px) saturate(1.4);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  pointer-events: none;

  svg {
    margin-left: 3px;
  }
`;

export const DurationChip = styled.span`
  position: absolute;
  left: 6px;
  bottom: 6px;
  z-index: 1;
  padding: 2px 7px;
  border-radius: 6px;
  color: #fff;
  background: rgba(9, 16, 32, 0.62);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
`;

const PlayGlyph: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M4.5 2.8v12.4L15 9z" fill="currentColor" />
  </svg>
);

const VideoLayer: React.FC<{ src: string; label: string; compact: boolean }> = ({ src, label, compact }) => {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return <ImageUnavailableState compact={compact} />;
  return (
    <>
      {!ready && <Skeleton $shimmer />}
      <VideoLayerEl
        data-media-layer="full"
        src={src}
        aria-label={label}
        muted
        playsInline
        preload="metadata"
        $ready={ready}
        onLoadedMetadata={() => setReady(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
};

export interface MediaSurfaceProps {
  kind: 'image' | 'video';
  /** Full-resolution URL. Empty while an outgoing upload has no URL yet. */
  src: string;
  /** Low-resolution preview, shown blurred until `src` has loaded. */
  previewSrc?: string;
  alt: string;
  /** `fill` covers its positioned parent (album tile); `solo` sizes itself. */
  variant: 'fill' | 'solo';
  /** Natural size recorded on the attachment, when the storage kept it. */
  dims?: { width?: unknown; height?: unknown };
  /** Duration in seconds, shown as a chip on videos. */
  duration?: string;
  /** Outgoing upload: shimmer while the URL is pending. */
  pending?: boolean;
  /** CSS border-radius for the stage (per corner for album tiles). */
  radius?: string;
  /** Solo only: opens the preview. Omit for tiles, which own the click. */
  onOpen?: () => void;
  /** Clickable item: zoom cursor and hover zoom. Defaults to `Boolean(onOpen)`. */
  interactive?: boolean;
  /** Blur and dim the picture, used behind the "+N" count. */
  blurred?: boolean;
  /** Show the play badge and duration chip on videos. Defaults to true. */
  chrome?: boolean;
  /** Called only when the server confirms the file is gone. */
  onGone?: () => void;
}

/**
 * The in-bubble picture of one media file: a shimmer while it loads, the
 * preview blurred until the full file is decoded, a 180ms fade to the real
 * image, and a self-contained unavailable state when it cannot be shown.
 */
const MediaSurface: React.FC<MediaSurfaceProps> = ({
  kind,
  src,
  previewSrc,
  alt,
  variant,
  dims,
  duration,
  pending = true,
  radius = 'var(--ethora-radius-md, 14px)',
  onOpen,
  onGone,
  interactive,
  blurred = false,
  chrome = true,
}) => {
  const isImage = kind === 'image';
  const full = useMediaProbe(isImage && src ? src : undefined, onGone);
  const hasPreview = isImage && Boolean(previewSrc) && previewSrc !== src;
  const low = useMediaProbe(hasPreview ? previewSrc : undefined, onGone);

  const durationLabel = kind === 'video' ? formatDuration(duration) : '';
  const isInteractive = interactive ?? Boolean(onOpen);
  const cursor = !isInteractive
    ? 'default'
    : isImage
      ? 'zoom-in'
      : 'pointer';

  // Solo boxes are sized before anything loads when the storage kept the
  // dimensions; otherwise the first decoded size takes over.
  let solo: { width: number; height: number } =
    kind === 'video' ? SOLO_VIDEO_DEFAULT_BOX : SOLO_DEFAULT_BOX;
  if (variant === 'solo') {
    const knownW = parseDimension(dims?.width);
    const knownH = parseDimension(dims?.height);
    const natural =
      fitMediaBox(knownW, knownH) ??
      (full.status === 'loaded' ? fitMediaBox(full.width, full.height) : null) ??
      (low.status === 'loaded' ? fitMediaBox(low.width, low.height) : null);
    if (natural) solo = natural;
  }

  const soloStyle: React.CSSProperties | undefined =
    variant === 'solo'
      ? {
          width: `min(${solo.width}px, 100%)`,
          aspectRatio: `${solo.width} / ${solo.height}`,
          height: 'auto',
        }
      : undefined;

  let body: React.ReactNode;
  if (kind === 'video') {
    body = src ? (
      <VideoLayer key={src} src={src} label={alt} compact={variant === 'fill'} />
    ) : (
      <Skeleton $shimmer={pending} />
    );
  } else if (!src) {
    body = <Skeleton $shimmer={pending} />;
  } else if (full.status === 'loaded') {
    body = (
      <>
        {low.status === 'loaded' && (
          <PreviewLayer src={previewSrc} alt="" aria-hidden="true" $blurred />
        )}
        <FullLayer data-media-layer="full" src={src} alt={alt} />
      </>
    );
  } else if (low.status === 'loaded') {
    body = (
      <PreviewLayer
        data-media-layer="preview"
        src={previewSrc}
        alt={alt}
        $blurred={full.status !== 'error'}
      />
    );
  } else if (full.status === 'error' && (!hasPreview || low.status === 'error')) {
    body = <ImageUnavailableState compact={variant === 'fill'} />;
  } else {
    body = <Skeleton $shimmer />;
  }

  const stage = (
    <Stage
      $variant={variant}
      $radius={radius}
      $cursor={cursor}
      $zoom={isImage && isInteractive}
      $blurred={blurred}
      style={soloStyle}
      data-testid="media-surface"
      data-state={kind === 'video' ? 'video' : full.status}
    >
      {body}
      {chrome && kind === 'video' && src && (
        <>
          <PlayBadge aria-hidden="true">
            <PlayGlyph />
          </PlayBadge>
          {durationLabel && <DurationChip>{durationLabel}</DurationChip>}
        </>
      )}
    </Stage>
  );

  if (variant === 'solo' && onOpen) {
    return (
      <SoloTrigger
        type="button"
        aria-label={alt}
        onClick={onOpen}
        style={{ maxWidth: '100%' }}
      >
        {stage}
      </SoloTrigger>
    );
  }
  return stage;
};

export default MediaSurface;

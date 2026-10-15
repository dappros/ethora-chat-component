import { safeImageUrl } from '../../helpers/safeUrl';
import React, { useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { ImageUnavailableState } from '../MainComponents/ImageUnavailable';
import { useMediaProbe } from '../../hooks/useMediaProbe';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { isGifFile } from '../../helpers/fileKind';
import { reducedMotion, shimmerBackground } from '../../styles/motion';
import {
  computeSoloBox,
  formatDuration,
  SoloBox,
  parseDimension,
  SOLO_DEFAULT_BOX,
  SOLO_MIN_SHORT_SIDE_PX,
  SOLO_VIDEO_DEFAULT_BOX,
  MEDIA_WIDTH_CSS,
  SOLO_MAX_HEIGHT_CSS,
} from '../../helpers/mediaBox';

/** Crossfade from the skeleton or the blurred preview to the sharp image. */
const FADE_IN_MS = 220;
/** The solo box easing to its real ratio once the size is known. */
const BOX_EASE_MS = 160;

const revealIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const revealOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const sweep = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(260%); }
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
  /** A picture smaller than its frame sits on a soft neutral tile. */
  $tile?: boolean;
}

/** Solo stages ease their size when the real ratio replaces the placeholder. */
const soloTransition = css`
  transition:
    width ${BOX_EASE_MS}ms ease,
    aspect-ratio ${BOX_EASE_MS}ms ease;
  ${reducedMotion}
`;

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
  ${({ $tile }) =>
    $tile
      ? css`
          background-color: color-mix(
            in srgb,
            var(--ethora-color-text, #141414) 7%,
            var(--ethora-color-bg-subtle, #f3f6fc)
          );
        `
      : ''}
  cursor: ${({ $cursor }) => $cursor};
  ${({ $variant }) => ($variant === 'solo' ? soloTransition : '')}
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
  border-radius: var(--ethora-radius-md, 12px);

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const Skeleton = styled.div<{ $shimmer: boolean; $leaving?: boolean }>`
  position: absolute;
  inset: 0;
  /* The glyph shows only when the box is big enough to carry it. */
  container-type: size;
  display: flex;
  align-items: center;
  justify-content: center;
  ${({ $shimmer }) =>
    $shimmer
      ? shimmerBackground
      : css`
          background-color: var(--ethora-color-bg-subtle, #f3f6fc);
        `}
  ${({ $leaving }) =>
    $leaving
      ? css`
          animation: ${revealOut} ${FADE_IN_MS}ms ease both;
          pointer-events: none;
          ${reducedMotion}
          @media (prefers-reduced-motion: reduce) {
            opacity: 0;
          }
        `
      : ''}
`;

const SkeletonGlyph = styled.svg`
  display: none;
  width: 28px;
  height: 28px;
  color: var(--ethora-color-text, #141414);
  opacity: 0.2;

  @container (min-width: 96px) and (min-height: 96px) {
    display: block;
  }
`;

/** Thin bar along the bottom edge while the full file is still coming down. */
const LoadBar = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  height: 2px;
  overflow: hidden;
  pointer-events: none;
  background: rgba(255, 255, 255, 0.22);
`;

const LoadBarFill = styled.div<{ $value?: number }>`
  height: 100%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.25);
  ${({ $value }) =>
    $value === undefined
      ? css`
          width: 38%;
          animation: ${sweep} 1.2s ease-in-out infinite;
          ${reducedMotion}
        `
      : css`
          width: ${Math.min(100, Math.max(0, $value))}%;
          transition: width 200ms ease;
          ${reducedMotion}
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
          transform: scale(1.06);
        `
      : ''}
  animation: ${revealIn} ${FADE_IN_MS}ms ease both;
  ${reducedMotion}
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

/** Small "GIF" pill, bottom-left, on an animated picture. */
export const GifChip = styled.span`
  position: absolute;
  left: 6px;
  bottom: 6px;
  z-index: 1;
  padding: 2px 7px;
  border-radius: 999px;
  color: #fff;
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  backdrop-filter: blur(10px) saturate(1.4);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.3;
  pointer-events: none;
`;

const PlayGlyph: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M4.5 2.8v12.4L15 9z" fill="currentColor" />
  </svg>
);

/** Hide the native broken-picture rendering (icon and alt text) at once. */
const hideBroken = (event: React.SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.style.visibility = 'hidden';
};

const VideoLayer: React.FC<{ src: string; label: string; compact: boolean; poster?: string }> = ({ src, label, compact, poster }) => {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return <ImageUnavailableState compact={compact} />;
  return (
    <>
      {!ready && <Skeleton $shimmer />}
      <VideoLayerEl
        data-media-layer="full"
        src={src}
        poster={poster}
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
  /** The opener exists but cannot act yet (no file URL): keeps the element tree stable. */
  openDisabled?: boolean;
  /** Clickable item: zoom cursor and hover zoom. Defaults to `Boolean(onOpen)`. */
  interactive?: boolean;
  /** Blur and dim the picture, used behind the "+N" count. */
  blurred?: boolean;
  /** MIME type of the file; `image/gif` makes the picture animate in place. */
  mimetype?: string;
  /** Show the play badge and duration chip on videos. Defaults to true. */
  chrome?: boolean;
  /** Sender's own picture (blob URL): shown sharp and at once, ahead of `src`. */
  localSrc?: string;
  /** 0 to 100 download progress of `src`, when known; otherwise a quiet sweep. */
  loadProgress?: number;
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
  radius = 'var(--ethora-radius-md, 12px)',
  onOpen,
  interactive,
  blurred = false,
  chrome = true,
  localSrc,
  loadProgress,
  openDisabled = false,
  mimetype,
}) => {
  const isImage = kind === 'image';
  const reducedMotionPref = usePrefersReducedMotion();
  const isGif = isImage && (isGifFile(mimetype, alt) || isGifFile(undefined, src));
  // An animated picture needs the original: the storage's preview is a still.
  // With reduced motion the still is exactly what is wanted.
  const animate = isGif && !reducedMotionPref;
  const local = useMediaProbe(isImage && localSrc ? localSrc : undefined);
  const localReady = local.status === 'loaded';
  const hasPreview = isImage && Boolean(previewSrc) && previewSrc !== src;
  // A bubble or a grid tile is at most a few hundred pixels wide, which the
  // storage's preview already covers: draw that sharp and leave the original
  // alone (a phone photo is several megabytes). The original is fetched only
  // as a fallback when the preview fails, or for a small picture the
  // attachment says is shown at its natural size (a preview would upscale).
  const recordedBox =
    variant === 'solo'
      ? computeSoloBox(parseDimension(dims?.width), parseDimension(dims?.height))
      : null;
  const previewOnly = hasPreview && !animate && recordedBox?.mode !== 'natural';
  const low = useMediaProbe(hasPreview ? previewSrc : undefined);
  const full = useMediaProbe(
    isImage && src && (!previewOnly || low.status === 'error') ? src : undefined
  );

  const durationLabel = kind === 'video' ? formatDuration(duration) : '';
  const isInteractive = interactive ?? (Boolean(onOpen) && !openDisabled);
  const cursor = !isInteractive
    ? 'default'
    : isImage
      ? 'zoom-in'
      : 'pointer';

  // The size is settled as early as anything can say it: what the storage
  // recorded, then the sender's own file, then the first decoded header of
  // the full image, and last a downscaled preview (whose ratio alone is
  // trusted). Until then a neutral 4:3 box is reserved and it eases to the
  // real ratio, so the list does not jump.
  let solo: SoloBox | null = null;
  let placeholder = false;
  if (variant === 'solo') {
    if (kind === 'video') {
      const { width, height } = SOLO_VIDEO_DEFAULT_BOX;
      solo = { width, height, imageWidth: width, imageHeight: height, mode: 'fit' };
    } else {
      solo =
        computeSoloBox(parseDimension(dims?.width), parseDimension(dims?.height)) ??
        (localReady ? computeSoloBox(local.width, local.height) : null) ??
        computeSoloBox(full.width, full.height) ??
        (low.width > 0 ? computeSoloBox(low.width, low.height, { ratioOnly: true }) : null);
      if (!solo) {
        placeholder = true;
        const { width, height } = SOLO_DEFAULT_BOX;
        solo = { width, height, imageWidth: width, imageHeight: height, mode: 'fit' };
      }
    }
  }
  const natural = solo?.mode === 'natural';

  // The picture's own size, then the pane's shared media width, then the
  // height cap turned into a width at this ratio. A definite length (not a
  // percentage) so it still counts inside the shrink-wrapped bubble.
  const soloRatio = solo ? Math.round((solo.width / solo.height) * 10000) / 10000 : 1;
  const unavailable =
    kind === 'image' &&
    Boolean(src) &&
    full.status === 'error' &&
    !localReady &&
    (!hasPreview || low.status === 'error');
  // A failed picture of unknown size gets a compact card, not the 4:3 box.
  const compactCard = unavailable && placeholder;
  const soloStyle: React.CSSProperties | undefined = compactCard
    ? { width: `min(280px, ${MEDIA_WIDTH_CSS})`, height: '160px' }
    : solo
    ? {
        width: natural
          ? `min(${solo.width}px, ${MEDIA_WIDTH_CSS})`
          : `min(${solo.width}px, ${MEDIA_WIDTH_CSS}, calc(${SOLO_MAX_HEIGHT_CSS} * ${soloRatio}))`,
        aspectRatio: `${solo.width} / ${solo.height}`,
        height: 'auto',
        minHeight: `${Math.min(solo.height, SOLO_MIN_SHORT_SIDE_PX)}px`,
      }
    : undefined;

  // A natural-size picture is drawn at its own size, centred on the tile.
  const layerStyle: React.CSSProperties | undefined =
    natural && solo
      ? {
          width: `${solo.imageWidth}px`,
          height: `${solo.imageHeight}px`,
          margin: 'auto',
          objectFit: 'contain',
        }
      : undefined;

  const fullLoaded = full.status === 'loaded';
  const lowLoaded = low.status === 'loaded';
  const showLocal = localReady && !fullLoaded;
  const anyPicture = fullLoaded || lowLoaded || localReady;
  // The sharp preview stands in for the original (see `previewOnly`).
  const previewIsPicture = previewOnly && lowLoaded && !fullLoaded;
  const showLoadBar =
    isImage &&
    Boolean(src) &&
    !previewOnly &&
    lowLoaded &&
    !localReady &&
    !fullLoaded &&
    full.status !== 'error';
  const mainStatus = previewOnly && low.status !== 'error' ? low.status : full.status;
  const retryAll = () => {
    low.retry();
    full.retry();
  };

  let body: React.ReactNode;
  if (kind === 'video') {
    body = src ? (
      <VideoLayer key={src} src={src} poster={previewSrc || undefined} label={alt} compact={variant === 'fill'} />
    ) : (
      <Skeleton $shimmer={pending} />
    );
  } else if (unavailable) {
    body = (
      <ImageUnavailableState
        compact={variant === 'fill'}
        onRetry={variant === 'solo' ? retryAll : undefined}
      />
    );
  } else {
    body = (
      <>
        {!anyPicture ? (
          <Skeleton $shimmer={Boolean(src) || pending}>
            <SkeletonGlyph viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="9" cy="10" r="1.7" fill="currentColor" />
              <path d="M4 18l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
            </SkeletonGlyph>
          </Skeleton>
        ) : (
          <Skeleton key="skeleton-out" $shimmer={false} $leaving />
        )}
        {lowLoaded && !previewOnly && !natural && !localReady && (
          <PreviewLayer
            data-media-layer={fullLoaded ? undefined : 'preview'}
            src={safeImageUrl(low.url)}
            alt={fullLoaded ? '' : alt}
            aria-hidden={fullLoaded ? 'true' : undefined}
            $blurred={fullLoaded || full.status !== 'error'}
            onError={(event) => {
              hideBroken(event);
              low.fail();
            }}
          />
        )}
        {localReady && (
          <Layer
            data-media-layer={showLocal ? 'local' : undefined}
            src={safeImageUrl(localSrc)}
            alt={showLocal ? alt : ''}
            aria-hidden={showLocal ? undefined : 'true'}
            style={layerStyle}
            onError={(event) => {
              hideBroken(event);
              local.fail();
            }}
          />
        )}
        {fullLoaded && (
          <FullLayer
            data-media-layer="full"
            src={safeImageUrl(full.url)}
            alt={alt}
            style={layerStyle}
            onError={(event) => {
              hideBroken(event);
              full.fail();
            }}
          />
        )}
        {previewIsPicture && !localReady && (
          <FullLayer
            data-media-layer="full"
            src={safeImageUrl(low.url)}
            alt={alt}
            style={layerStyle}
            onError={(event) => {
              hideBroken(event);
              low.fail();
            }}
          />
        )}
        {showLoadBar && (
          <LoadBar data-testid="media-load-bar" aria-hidden="true">
            <LoadBarFill $value={loadProgress} />
          </LoadBar>
        )}
      </>
    );
  }

  const stage = (
    <Stage
      $variant={variant}
      $radius={radius}
      $cursor={cursor}
      $zoom={isImage && isInteractive && !natural}
      $blurred={blurred}
      $tile={natural}
      style={soloStyle}
      data-testid="media-surface"
      data-state={kind === 'video' ? 'video' : mainStatus}
      data-mode={solo ? (placeholder ? 'placeholder' : solo.mode) : undefined}
    >
      {body}
      {chrome && isGif && anyPicture && <GifChip aria-hidden="true">GIF</GifChip>}
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
        disabled={openDisabled}
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

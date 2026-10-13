import React from 'react';
import styled from 'styled-components';
import { useT } from '../../i18n/useT';

/**
 * Our own "image could not be loaded" illustration. Pure inline SVG: no
 * raster, no <image>, no href, so nothing external is ever requested. The
 * colours come from the primary token through currentColor, so it follows
 * the host brand and the dark scheme.
 */
const ArtWrap = styled.span`
  display: inline-flex;
  flex: none;
  color: var(--ethora-color-primary, #2775ea);
`;

export interface ImageUnavailableArtProps {
  /** Rendered width and height in CSS pixels. The viewBox scales crisply. */
  size?: number;
}

export const ImageUnavailableArt: React.FC<ImageUnavailableArtProps> = ({ size = 96 }) => (
  <ArtWrap aria-hidden="true" data-testid="image-unavailable-art">
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
     
      focusable="false"
    >
      {/* Soft picture frame, a low-opacity tint of the brand blue. */}
      <rect
        x="12"
        y="18"
        width="72"
        height="60"
        rx="14"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <rect
        x="12.75"
        y="18.75"
        width="70.5"
        height="58.5"
        rx="13.25"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      {/* Sun and mountain ridge, the classic "picture" motif. */}
      <circle cx="36" cy="38" r="6.5" fill="currentColor" fillOpacity="0.45" />
      <path
        d="M19 67 L39 48 L52 60 L61 52 L77 67 Z"
        fill="currentColor"
        fillOpacity="0.32"
      />
      {/* Cut-out slash, then the accent line on top of it: "not available". */}
      <path
        d="M22 22 L74 74"
        stroke="var(--ethora-color-bg, #ffffff)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M22 22 L74 74"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  </ArtWrap>
);

const Box = styled.div<{ $compact: boolean }>`
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  /* Lets the caption queries measure this box, so tiny tiles drop the text. */
  container-type: size;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  text-align: center;
  background-color: var(--ethora-color-bg-subtle, #f3f6fc);
  color: var(--ethora-color-text-muted, #6c6c6c);

  @container (max-width: 119px) {
    .image-unavailable-caption,
    .image-unavailable-hint {
      display: none;
    }
  }

  @container (max-width: 159px) {
    .image-unavailable-hint {
      display: none;
    }
  }
`;

const Caption = styled.span`
  font-size: var(--ethora-font-size-sm, 13px);
  font-weight: 600;
  line-height: 1.3;
  color: var(--ethora-color-text-secondary, #53575a);
`;

const Hint = styled.span`
  font-size: var(--ethora-font-size-xs, 12px);
  line-height: 1.35;
  max-width: 220px;
`;

export interface ImageUnavailableStateProps {
  /**
   * Compact: the glyph only, about 28px, for album grid tiles. Full: the
   * illustration, the caption and a hint, for a solo bubble or the viewer.
   */
  compact?: boolean;
}

/** Self-contained "could not load" state that fills its positioned parent. */
export const ImageUnavailableState: React.FC<ImageUnavailableStateProps> = ({
  compact = false,
}) => {
  const t = useT();
  const label = t('media.imageUnavailable');
  return (
    <Box $compact={compact} role="img" aria-label={label} data-testid="media-unavailable">
      {compact ? (
        <ImageUnavailableArt size={28} />
      ) : (
        <>
          <ImageUnavailableArt size={80} />
          <Caption className="image-unavailable-caption">{label}</Caption>
          <Hint className="image-unavailable-hint">{t('media.imageUnavailableHint')}</Hint>
        </>
      )}
    </Box>
  );
};

export default ImageUnavailableState;

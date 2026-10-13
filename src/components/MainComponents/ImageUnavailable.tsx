import React from 'react';
import styled from 'styled-components';
import { useT } from '../../i18n/useT';

/**
 * Our own "image could not be loaded" illustration. Pure inline SVG: no
 * raster, no <image>, no href, so nothing external is ever requested. A soft
 * photo card (rolling hills, a sun, a cloud) stays calm and intact; the
 * "unavailable" cue is a small badge on its corner. Colours come from the
 * primary token through currentColor, so it follows the host brand and the
 * dark scheme. The badge ring defaults to the subtle surface the art sits
 * on and can be overridden with --ethora-unavailable-ring.
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

const RING = 'var(--ethora-unavailable-ring, var(--ethora-color-bg-subtle, #f3f6fc))';
const WARM = 'var(--ethora-unavailable-accent, #e8920c)';

export const ImageUnavailableArt: React.FC<ImageUnavailableArtProps> = ({ size = 96 }) => {
  const uid = React.useId().replace(/:/g, '');
  const clipId = `iu-clip-${uid}`;
  const fillId = `iu-fill-${uid}`;
  const small = size <= 40;
  return (
    <ArtWrap aria-hidden="true" data-testid="image-unavailable-art">
      <svg width={size} height={size} viewBox="0 0 96 96" fill="none" focusable="false">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.05" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x="12" y="20" width="66" height="56" rx="15" />
          </clipPath>
        </defs>

        {!small && (
          <rect
            x="20"
            y="14"
            width="62"
            height="54"
            rx="14"
            transform="rotate(-6 51 41)"
            fill="currentColor"
            fillOpacity="0.07"
            stroke="currentColor"
            strokeOpacity="0.16"
            strokeWidth="1"
          />
        )}

        {/* Front card: solid underlay keeps it legible, gradient tints it. */}
        <rect
          x="12"
          y="20"
          width="66"
          height="56"
          rx="15"
          fill="var(--ethora-color-bg, #ffffff)"
          fillOpacity="0.55"
        />
        <rect x="12" y="20" width="66" height="56" rx="15" fill={`url(#${fillId})`} />

        <g clipPath={`url(#${clipId})`}>
          {!small && (
            <>
              <circle cx="31" cy="39" r="10.5" fill="currentColor" fillOpacity="0.1" />
              <path
                d="M52 37.5h12a3.75 3.75 0 0 0 0-7.5 5 5 0 0 0-9.4-1.2A4.4 4.4 0 0 0 52 37.5Z"
                fill="currentColor"
                fillOpacity="0.28"
              />
            </>
          )}
          <circle cx="31" cy="39" r={small ? 6 : 5.5} fill="currentColor" fillOpacity="0.55" />
          <path
            d="M10 63C22 51 34 50 45 56S66 62 80 50V80H10Z"
            fill="currentColor"
            fillOpacity="0.24"
          />
          <path
            d="M10 69C24 61 37 62 49 67S68 71 80 63V80H10Z"
            fill="currentColor"
            fillOpacity="0.34"
          />
        </g>
        <rect
          x="12.5"
          y="20.5"
          width="65"
          height="55"
          rx="14.5"
          stroke="currentColor"
          strokeOpacity="0.28"
        />

        {!small && (
          <>
            <path
              d="M84 22v6M81 25h6"
              stroke="currentColor"
              strokeOpacity="0.5"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Unavailable badge on the corner: ring, warm tint, "!" glyph. */}
        <circle cx="74" cy="72" r="15" fill={RING} />
        <circle cx="74" cy="72" r="12" fill={WARM} fillOpacity="0.2" />
        <circle cx="74" cy="72" r="12" stroke={WARM} strokeOpacity="0.35" strokeWidth="1" />
        <path d="M74 66.5v6.5" stroke={WARM} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="74" cy="77.4" r="1.5" fill={WARM} />
      </svg>
    </ArtWrap>
  );
};

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

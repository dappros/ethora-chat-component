import React from 'react';
import styled, { css, keyframes } from 'styled-components';
import { useT } from '../../i18n/useT';
import { reducedMotion } from '../../styles/motion';

/** How long the scrim takes to fade once the upload is done. */
export const SCRIM_FADE_MS = 180;

const scrimOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const Scrim = styled.div<{ $failed: boolean; $leaving?: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 2;
  /* The ring hides itself on tiny boxes by measuring this box. */
  container-type: size;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  /* No padding: a container query measures the content box, and the ring
     must appear exactly when the whole 64px box can hold it. */
  padding: 0;
  box-sizing: border-box;
  border-radius: inherit;
  text-align: center;
  color: #fff;
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: 500;
  pointer-events: none;
  ${({ $failed }) =>
    $failed
      ? css`
          background: rgba(185, 28, 28, 0.62);
          background: color-mix(in srgb, var(--ethora-color-danger, #d02b1f) 62%, rgba(9, 16, 32, 0.35));
        `
      : css`
          background: rgba(9, 16, 32, 0.34);
          -webkit-backdrop-filter: blur(6px) saturate(1.1);
          backdrop-filter: blur(6px) saturate(1.1);
        `}

  ${({ $leaving }) =>
    $leaving
      ? css`
          animation: ${scrimOut} ${SCRIM_FADE_MS}ms ease both;
          ${reducedMotion}
          @media (prefers-reduced-motion: reduce) {
            opacity: 0;
          }
        `
      : ''}

  .upload-failed-label {
    padding: 0 8px;
  }

  /* The ring is a fixed circle: it appears only when the box can hold it. */
  @container (max-width: 63px) {
    .upload-ring {
      display: none;
    }
  }

  @container (max-height: 63px) {
    .upload-ring {
      display: none;
    }
  }

  @container (max-width: 99px) {
    .upload-failed-label {
      display: none;
    }
  }
`;

const RING_PX = 40;
const RING_STROKE = 3;
const RING_RADIUS = (RING_PX - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const RingWrap = styled.span`
  position: relative;
  flex: none;
  display: block;
  width: ${RING_PX}px;
  height: ${RING_PX}px;
  aspect-ratio: 1 / 1;
`;

const RingArc = styled.circle`
  transition: stroke-dashoffset 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  ${reducedMotion}
`;

const Percent = styled.span`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const RetryGlyph = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
`;

/** The circular-arrow retry mark, shared by the failed tile and the "+N" badge. */
export const RetryIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Thin circular progress ring. The SVG is a fixed 40px square with a
 * viewBox, so it can never stretch; the arc is drawn by moving the dash
 * offset from the full circumference (empty) down to zero (complete).
 */
export const ProgressRing: React.FC<{ percent: number; children?: React.ReactNode }> = ({
  percent,
  children,
}) => {
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = RING_CIRCUMFERENCE * (1 - clamped / 100);
  const center = RING_PX / 2;
  return (
    <RingWrap className="upload-ring" aria-hidden="true">
      <svg
        width={RING_PX}
        height={RING_PX}
        viewBox={`0 0 ${RING_PX} ${RING_PX}`}
        style={{ display: 'block' }}
      >
        <circle
          cx={center}
          cy={center}
          r={RING_RADIUS}
          fill="none"
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth={RING_STROKE}
        />
        <RingArc
          cx={center}
          cy={center}
          r={RING_RADIUS}
          fill="none"
          stroke="#fff"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          data-testid="upload-ring-arc"
        />
      </svg>
      {children}
    </RingWrap>
  );
};

interface MediaUploadOverlayProps {
  /** `uploading` covers "waiting for the siblings" too; `failed` is a retry prompt. */
  status: 'uploading' | 'failed';
  progress?: number;
  /** Upload is done: fade the scrim out instead of leaving it up. */
  leaving?: boolean;
}

/**
 * State layer over an outgoing attachment: a frosted scrim with a progress
 * ring while it goes up, and a tinted scrim with a retry glyph once it has
 * failed. The parent owns the click, so this stays pointer-transparent and
 * can sit inside a button without nesting interactive elements.
 */
export const MediaUploadOverlay: React.FC<MediaUploadOverlayProps> = ({
  status,
  progress = 0,
  leaving = false,
}) => {
  const t = useT();

  if (status === 'failed') {
    return (
      <Scrim $failed>
        <RetryGlyph aria-hidden="true">
          <RetryIcon />
        </RetryGlyph>
        <span className="upload-failed-label">{t('attachment.uploadFailed')}</span>
      </Scrim>
    );
  }

  const rounded = Math.round(progress);
  return (
    <Scrim $failed={false} $leaving={leaving} role="status" aria-label={t('media.uploadProgress', { percent: rounded })}>
      <ProgressRing percent={progress}>
        {rounded < 100 && <Percent>{`${rounded}%`}</Percent>}
      </ProgressRing>
    </Scrim>
  );
};

export default MediaUploadOverlay;

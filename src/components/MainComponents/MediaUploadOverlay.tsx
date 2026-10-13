import React from 'react';
import styled from 'styled-components';
import Loader from '../styled/Loader';
import { useT } from '../../i18n/useT';

const Scrim = styled.div<{ $failed: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  box-sizing: border-box;
  text-align: center;
  color: #fff;
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: 500;
  background: ${({ $failed }) =>
    $failed ? 'rgba(185, 28, 28, 0.62)' : 'rgba(9, 16, 32, 0.48)'};
  pointer-events: none;
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

const Percent = styled.span`
  font-variant-numeric: tabular-nums;
`;

interface MediaUploadOverlayProps {
  /** `uploading` covers "waiting for the siblings" too; `failed` is a retry prompt. */
  status: 'uploading' | 'failed';
  progress?: number;
}

/**
 * State badge laid over an outgoing attachment: a spinner with the upload
 * percentage while it goes up, and a retry glyph once it has failed. The
 * parent owns the click, so this stays pointer-transparent and can sit
 * inside a button without nesting interactive elements.
 */
export const MediaUploadOverlay: React.FC<MediaUploadOverlayProps> = ({
  status,
  progress = 0,
}) => {
  const t = useT();

  if (status === 'failed') {
    return (
      <Scrim $failed>
        <RetryGlyph aria-hidden="true">
          <RetryIcon />
        </RetryGlyph>
        <span>{t('attachment.uploadFailed')}</span>
      </Scrim>
    );
  }

  const rounded = Math.round(progress);
  return (
    <Scrim $failed={false} role="status">
      <Loader size={24} color="#fff" />
      {rounded < 100 && <Percent>{`${rounded}%`}</Percent>}
    </Scrim>
  );
};

export default MediaUploadOverlay;

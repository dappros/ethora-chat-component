import React from 'react';
import styled, { css, keyframes } from 'styled-components';
import { reducedMotion } from '../../../styles/motion';
import { getFileExtension } from '../../../helpers/fileKind';
import { useT } from '../../../i18n/useT';

/*
 * Chrome for the full-screen media viewer. The viewer is a dark surface over
 * the whole page whatever the host theme is, so these use fixed values for
 * the backdrop and text. The accent comes from the --ethora-* tokens.
 */

export const VIEWER_TEXT = '#f5f7fa';
export const VIEWER_MUTED = 'rgba(245, 247, 250, 0.68)';
export const VIEWER_SURFACE = 'rgba(255, 255, 255, 0.08)';
export const VIEWER_SURFACE_HOVER = 'rgba(255, 255, 255, 0.18)';
const VIEWER_ACCENT = 'var(--ethora-color-primary, #0052cd)';

const viewerIn = keyframes`
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
`;

const viewerOut = keyframes`
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.98); }
`;

export const ViewerSurface = styled.div<{ $closing: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  color: ${VIEWER_TEXT};
  background-color: rgba(10, 12, 18, 0.92);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  animation: ${({ $closing }) =>
    $closing
      ? css`${viewerOut} 160ms ease-in forwards`
      : css`${viewerIn} 160ms ease-out both`};
  ${reducedMotion}

  /* Without backdrop-filter the translucent colour would sit over the chat
     and read as a smudge; go solid instead. */
  @supports not ((backdrop-filter: blur(8px)) or (-webkit-backdrop-filter: blur(8px))) {
    background-color: #0a0c12;
  }
`;

export const TopBar = styled.header`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  min-height: 64px;
  padding: 10px 16px;
  box-sizing: border-box;
`;

export const TopIdentity = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 auto;
  min-width: 0;
`;

export const SenderText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
`;

export const SenderName = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: ${VIEWER_TEXT};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SubLine = styled.span`
  font-size: 13px;
  color: ${VIEWER_MUTED};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const ActionGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
`;

export const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  margin: 0;
  flex: 0 0 auto;
  border: 0;
  border-radius: 50%;
  background-color: ${VIEWER_SURFACE};
  color: ${VIEWER_TEXT};
  cursor: pointer;
  transition: background-color 150ms ease;

  &:hover:not(:disabled) {
    background-color: ${VIEWER_SURFACE_HOVER};
  }

  &:focus-visible {
    outline: 2px solid ${VIEWER_TEXT};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
`;

export const Stage = styled.div`
  position: relative;
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
`;

export const MediaFrame = styled.div<{ $fit: 'media' | 'content' }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  ${({ $fit }) =>
    $fit === 'media'
      ? css`
          width: min(92vw, 100%);
          height: min(82vh, 100%);
        `
      : css`
          max-width: 92vw;
          max-height: 100%;
        `}
`;

export const NavButton = styled.button<{ $side: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => ($side === 'left' ? 'left: 12px;' : 'right: 12px;')}
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  margin: 0;
  transform: translateY(-50%);
  border: 0;
  border-radius: 50%;
  background-color: rgba(10, 12, 18, 0.55);
  color: ${VIEWER_TEXT};
  cursor: pointer;
  transition: background-color 150ms ease, opacity 150ms ease;

  &:hover:not(:disabled) {
    background-color: rgba(10, 12, 18, 0.8);
  }

  &:focus-visible {
    outline: 2px solid ${VIEWER_TEXT};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }
`;

export const BottomBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 0 0 auto;
  padding: 10px 16px 16px;
  box-sizing: border-box;
`;

export const ThumbStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding: 4px 4px;
  scrollbar-width: thin;
  scrollbar-color: ${VIEWER_SURFACE_HOVER} transparent;
`;

export const Thumb = styled.button<{ $active: boolean }>`
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  padding: 0;
  margin: 0;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  background-color: ${VIEWER_SURFACE};
  cursor: pointer;
  opacity: ${({ $active }) => ($active ? 1 : 0.6)};
  box-shadow: ${({ $active }) =>
    $active
      ? `0 0 0 2px #0a0c12, 0 0 0 4px ${VIEWER_ACCENT}`
      : '0 0 0 0 transparent'};
  transition: opacity 150ms ease, box-shadow 150ms ease;

  &:hover {
    opacity: 1;
  }

  &:focus-visible {
    outline: 2px solid ${VIEWER_TEXT};
    outline-offset: 2px;
  }
`;

export const ThumbImage = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
`;

export const ControlRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
`;

export const Counter = styled.span`
  justify-self: center;
  padding: 6px 14px;
  border-radius: 999px;
  background-color: ${VIEWER_SURFACE};
  color: ${VIEWER_TEXT};
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

export const ZoomGroup = styled.div`
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 6px;
`;

/* States that replace the media: loading error, file card and audio card. */

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  max-width: min(440px, 92vw);
  padding: 32px 24px;
  box-sizing: border-box;
  text-align: center;
  border-radius: 16px;
  background-color: rgba(255, 255, 255, 0.05);
  color: ${VIEWER_TEXT};
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: ${VIEWER_TEXT};
`;

const PanelText = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: ${VIEWER_MUTED};
  overflow-wrap: anywhere;
`;

const PanelActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
`;

const ButtonBase = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease;

  &:focus-visible {
    outline: 2px solid ${VIEWER_TEXT};
    outline-offset: 2px;
  }
`;

const PrimaryButton = styled(ButtonBase)`
  border: 0;
  background-color: ${VIEWER_ACCENT};
  color: #ffffff;

  &:hover {
    filter: brightness(1.1);
  }
`;

const SecondaryButton = styled(ButtonBase)`
  border: 1px solid rgba(255, 255, 255, 0.28);
  background-color: transparent;
  color: ${VIEWER_TEXT};

  &:hover {
    background-color: ${VIEWER_SURFACE};
  }
`;

interface ErrorPanelProps {
  onRetry: () => void;
  onDownload: () => void;
}

/** Shown in place of an image that cannot be loaded. No remote fallback image. */
export const ErrorPanel: React.FC<ErrorPanelProps> = ({
  onRetry,
  onDownload,
}) => {
  const t = useT();
  return (
    <Panel role="alert" data-testid="file-viewer-error">
      <BrokenImageGlyph />
      <PanelTitle>{t('modal.filePreview.unavailable')}</PanelTitle>
      <PanelActions>
        <SecondaryButton type="button" onClick={onRetry}>
          <RetryGlyph />
          {t('modal.filePreview.retry')}
        </SecondaryButton>
        <PrimaryButton type="button" onClick={onDownload}>
          <DownloadGlyph />
          {t('modal.filePreview.download')}
        </PrimaryButton>
      </PanelActions>
    </Panel>
  );
};

interface FileCardProps {
  fileName: string;
  unsupportedText: string;
  onDownload: () => void;
}

/** Large card for files the viewer cannot render (anything but image/video/audio/PDF). */
export const FileCard: React.FC<FileCardProps> = ({
  fileName,
  unsupportedText,
  onDownload,
}) => {
  const t = useT();
  const extension = getFileExtension(fileName).toUpperCase();
  return (
    <Panel data-testid="file-viewer-file-card">
      <FileBadge aria-hidden="true">
        <FileGlyph />
        {extension && <FileExtension>{extension}</FileExtension>}
      </FileBadge>
      <PanelTitle style={{ overflowWrap: 'anywhere' }}>
        {fileName || t('modal.filePreview.fileLabel')}
      </PanelTitle>
      <PanelText>{unsupportedText}</PanelText>
      <PrimaryButton type="button" onClick={onDownload}>
        <DownloadGlyph />
        {t('modal.filePreview.download')}
      </PrimaryButton>
    </Panel>
  );
};

interface AudioCardProps {
  fileName: string;
  src: string;
}

/** Audio gets a native player inside a card, so it reads as a clip, not a broken image. */
export const AudioCard: React.FC<AudioCardProps> = ({ fileName, src }) => (
  <Panel data-testid="file-viewer-audio-card">
    <FileBadge aria-hidden="true">
      <AudioGlyph />
    </FileBadge>
    <PanelTitle style={{ overflowWrap: 'anywhere' }}>{fileName}</PanelTitle>
    <audio
      controls
      preload="metadata"
      src={src}
      style={{ width: '100%', maxWidth: 360 }}
    />
  </Panel>
);

const FileBadge = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 116px;
  border-radius: 12px;
  background-color: ${VIEWER_SURFACE};
  color: ${VIEWER_TEXT};
`;

const FileExtension = styled.span`
  position: absolute;
  bottom: 14px;
  left: 0;
  right: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-align: center;
`;

/* Line icons, drawn at 1.6px so they sit with the chrome glyphs. */

const glyphProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export const ExternalLinkGlyph = () => (
  <svg {...glyphProps}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

export const RetryGlyph = () => (
  <svg {...glyphProps} width={16} height={16}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v4h-4" />
  </svg>
);

export const DownloadGlyph = () => (
  <svg {...glyphProps} width={16} height={16}>
    <path d="M12 4v11" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);

export const BrokenImageGlyph = () => (
  <svg {...glyphProps} width={56} height={56} strokeWidth={1.2}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M21 16l-5-5-8 9" />
    <path d="M4 4l16 16" />
  </svg>
);

export const FileGlyph = () => (
  <svg {...glyphProps} width={36} height={36} strokeWidth={1.3}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);

export const AudioGlyph = () => (
  <svg {...glyphProps} width={36} height={36} strokeWidth={1.3}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </svg>
);

/** Format a message timestamp for the viewer header; empty when unknown. */
export const formatViewerDate = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return date.toISOString();
  }
};

/** Returns the URL with a retry marker, so a retry is not served from the failed cache entry. */
export const withRetryMarker = (url: string, attempt: number): string => {
  if (!url || attempt <= 0) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}retry=${attempt}`;
};

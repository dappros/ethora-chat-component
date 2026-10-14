import { safeImageUrl } from '../../../helpers/safeUrl';
import React, { FC, useState } from 'react';
import styled from 'styled-components';
import { useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { useT } from '../../../i18n/useT';
import { MediaPreview } from '../../../helpers/lastMessagePreview';
import {
  appendFileToken,
  isSecureFileUrl,
  requestFileTokenRecovery,
} from '../../../helpers/secureFileUrl';
import {
  LastRoomMessageContainer,
  LastRoomMessageLine,
  LastRoomMessageName,
  LastRoomMessageText,
} from './StyledRoomComponents';

/** Edge of the thumbnail tile, and so the height of a thumbnail row. */
export const MEDIA_THUMB_PX = 18;

const Tile = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${MEDIA_THUMB_PX}px;
  height: ${MEDIA_THUMB_PX}px;
  flex-shrink: 0;
  margin-inline-end: 6px;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 4px;
  background-color: var(--ethora-color-bg-hover, #f0f2f5);
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const TileImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
`;

const PlayBadge = styled.span`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background-color: rgba(0, 0, 0, 0.28);
  pointer-events: none;
`;

const InlineIcon = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  margin-inline-end: 6px;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const Svg: FC<{ size: number; children: React.ReactNode }> = ({
  size,
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const PhotoGlyph: FC<{ size: number }> = ({ size }) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M21 16l-5-5-8 8" />
  </Svg>
);
const VideoGlyph: FC<{ size: number }> = ({ size }) => (
  <Svg size={size}>
    <rect x="3" y="6" width="13" height="12" rx="3" />
    <path d="M16 10.5l5-3v9l-5-3z" />
  </Svg>
);
const MicGlyph: FC<{ size: number }> = ({ size }) => (
  <Svg size={size}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0014 0M12 18v3" />
  </Svg>
);
const MusicGlyph: FC<{ size: number }> = ({ size }) => (
  <Svg size={size}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Svg>
);
const DocGlyph: FC<{ size: number }> = ({ size }) => (
  <Svg size={size}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
);
const LockGlyph: FC<{ size: number }> = ({ size }) => (
  <Svg size={size}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Svg>
);

const glyphFor = (kind: MediaPreview['kind']) => {
  switch (kind) {
    case 'image':
      return PhotoGlyph;
    case 'video':
      return VideoGlyph;
    case 'voice':
      return MicGlyph;
    case 'audio':
      return MusicGlyph;
    case 'sealed':
      return LockGlyph;
    default:
      return DocGlyph;
  }
};

interface LastMessageMediaProps {
  preview: MediaPreview;
  /** Sender line, already resolved by ChatRoomItem; empty omits it. */
  name?: string;
}

/**
 * Room-list preview for a media last message: a thumbnail (images, videos
 * with a poster) or an inline icon, then a localized label. Thumbnails come
 * from the message's own preview URL only, with the viewer's file token
 * appended; a thumbnail that fails (a secure URL that 404s, an expired
 * token) drops to the icon instead of a broken image, and nothing is ever
 * fetched from a placeholder host.
 */
const LastMessageMedia: FC<LastMessageMediaProps> = ({ preview, name }) => {
  const t = useT();
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );
  const [failedThumb, setFailedThumb] = useState<string | null>(null);

  const { kind, count, thumbUrl, fileName, durationText, caption } = preview;
  const tall = kind === 'image' || kind === 'video';
  const Glyph = glyphFor(kind);
  const showThumb = Boolean(thumbUrl) && failedThumb !== thumbUrl;

  let label: string;
  switch (kind) {
    case 'image':
      label =
        count > 1 ? t('lastMessage.photos', { count }) : t('lastMessage.photo');
      break;
    case 'video':
      label =
        count > 1 ? t('lastMessage.videos', { count }) : t('lastMessage.video');
      break;
    case 'voice':
      label = t('lastMessage.voice');
      break;
    case 'audio':
      label = t('lastMessage.audio');
      break;
    case 'sealed':
      label = t('media.sealedFile');
      break;
    case 'attachment':
      label = t('lastMessage.attachment');
      break;
    default:
      label =
        count > 1
          ? t('lastMessage.files', { count })
          : fileName || t('lastMessage.file');
  }
  if (durationText) label = `${label} ${durationText}`;
  if (caption) label = `${label}, ${caption}`;

  return (
    <LastRoomMessageContainer data-testid="last-message-media" data-kind={kind}>
      {name && (
        <LastRoomMessageName data-testid="last-message-name">
          {name}
        </LastRoomMessageName>
      )}
      <LastRoomMessageLine data-testid="last-message-line">
      {tall ? (
        <Tile data-testid="last-message-tile">
          {showThumb ? (
            <TileImg
              src={safeImageUrl(appendFileToken(thumbUrl, fileToken))}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => {
                if (thumbUrl && isSecureFileUrl(thumbUrl)) {
                  requestFileTokenRecovery();
                }
                setFailedThumb(thumbUrl ?? null);
              }}
            />
          ) : (
            <Glyph size={12} />
          )}
          {kind === 'video' && showThumb && (
            <PlayBadge data-testid="last-message-play">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </PlayBadge>
          )}
        </Tile>
      ) : (
        <InlineIcon>
          <Glyph size={14} />
        </InlineIcon>
      )}
      <LastRoomMessageText>{label}</LastRoomMessageText>
      </LastRoomMessageLine>
    </LastRoomMessageContainer>
  );
};

export default LastMessageMedia;

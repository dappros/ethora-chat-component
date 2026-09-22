import React, { useState } from 'react';
import styled from 'styled-components';
import { useSelector } from 'react-redux';
import { ApiFile } from '../../types/types';
import { RootState } from '../../roomStore';
import { getFileCategory, formatBytes } from './fileCategory';
import { appendFileToken } from '../../helpers/secureFileUrl';
import { FileIcon, DownloadIcon, DeleteIcon } from '../../assets/icons';
import { useT } from '../../i18n/useT';
import { useUiLocale } from '../../i18n/useT';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import {
  resolveIconColor,
  resolveIconBgColor,
} from '../../helpers/resolveIconColor';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 10px;
  margin-bottom: 8px;
`;

// Rendered as a <div role="button"> rather than a native <button> because it
// wraps its own delete/confirm <button> children - nesting an interactive
// button inside another button is invalid DOM and React warns on it.
const Thumb = styled.div`
  position: relative;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-sm, 8px);
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  background: var(--ethora-color-bg-subtle, #f5f7fa);
  aspect-ratio: 1 / 1;
  width: 100%;
  transition: box-shadow var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, ease);

  // Same hover/focus treatment as the document Row below, on top of the
  // tile's own shadow lift - the grid and the list read as one surface.
  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
    box-shadow: var(--ethora-shadow-sm, 0 1px 2px rgba(16, 24, 40, 0.06));
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ThumbImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const ThumbConfirmOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(20, 20, 20, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px;
`;

const ThumbConfirmText = styled.span`
  color: #fff;
  font-size: 11px;
  text-align: center;
`;

const ThumbConfirmActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ThumbConfirmButton = styled.button<{ $danger?: boolean }>`
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--ethora-radius-sm, 8px);
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const ThumbDeleteButton = styled.button`
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  background: rgba(20, 20, 20, 0.6);
  box-shadow: var(--ethora-shadow-sm, 0 1px 2px rgba(16, 24, 40, 0.3));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 4px;
  transition: background var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, ease);

  &:hover {
    background: rgba(20, 20, 20, 0.8);
  }

  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const RowsContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

// Row height/radius/hover match RoomList's ChatItem (see
// src/components/styled/RoomListComponents/index.tsx) so the Files tab
// reads as the same list surface as the room list rows above it.
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  min-width: 0;
  border-radius: var(--ethora-radius-md, 12px);
  padding: 8px;
  transition: background-color var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, ease);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const RowIconWrap = styled.div`
  width: 36px;
  height: 36px;
  border-radius: var(--ethora-radius-sm, 8px);
  background: var(--ethora-color-primary-soft, #e7edf9);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const RowMain = styled.button`
  flex: 1;
  // Without this, a flex item's automatic minimum width is its content's
  // min-content size - an unbreakable string (like a raw room id) can't
  // wrap, so its min-content size is its full rendered width, and that
  // refused to shrink no matter how narrow the panel got. This lets
  // RowMain shrink below that; RowMeta/RoomTag below need the same rule
  // for the same reason (see there).
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const RowName = styled.span`
  font-size: var(--ethora-font-size, 14px);
  color: var(--ethora-color-text, #141414);
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RowMeta = styled.span`
  font-size: 12px;
  color: var(--ethora-color-text-secondary, #5a5f66);
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  max-width: 100%;
`;

const RowMetaText = styled.span`
  white-space: nowrap;
  flex-shrink: 0;
`;

// Flex items don't shrink below their content's natural width by default,
// so an unresolvable/oversized room name used to win a tug-of-war with the
// action icons instead of truncating. min-width: 0 lets it shrink and the
// ellipsis take over once it's the resolved room title rather than a raw id
// (see FilesList's roomTitle lookup) - still bounded in case a real title
// is itself very long.
const RoomTag = styled.span`
  font-size: 11px;
  color: var(--ethora-color-text-muted, #8c8c8c);
  background: var(--ethora-color-bg-subtle, #f5f7fa);
  border-radius: 999px;
  padding: 1px 8px;
  min-width: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`;

const IconButton = styled.button`
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: var(--ethora-radius-sm, 8px);
  color: var(--ethora-color-text-secondary, #5a5f66);

  &:hover {
    background: var(--ethora-color-bg-subtle, #f5f7fa);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const ConfirmBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ethora-color-text-secondary, #5a5f66);
  white-space: nowrap;
`;

const ConfirmButton = styled.button<{ $danger?: boolean }>`
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 6px;
  border-radius: var(--ethora-radius-sm, 8px);
  color: ${({ $danger }) =>
    $danger
      ? 'var(--ethora-color-danger, #d92d20)'
      : 'var(--ethora-color-text-secondary, #5a5f66)'};

  &:hover {
    background: var(--ethora-color-bg-subtle, #f5f7fa);
  }
`;

export interface FilesListProps {
  items: ApiFile[];
  fileToken?: string;
  onPreview: (file: ApiFile) => void;
  onDownload: (file: ApiFile) => void;
  onDelete: (file: ApiFile) => void;
  compact?: boolean;
}

const FilesList: React.FC<FilesListProps> = ({
  items,
  fileToken,
  onPreview,
  onDownload,
  onDelete,
  compact,
}) => {
  const t = useT();
  const { config } = useChatSettingState();
  const locale = useUiLocale();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // `file.roomName` is actually the room's XMPP JID (see files.api.ts /
  // ApiFile) rather than a display name - printing it raw is what forced
  // the whole row wider than the panel. Resolve it against the rooms store
  // the same way the rest of the app shows room names, and hide the tag
  // rather than fall back to the raw id when the room isn't loaded locally.
  const rooms = useSelector((state: RootState) => state.rooms.rooms);
  const resolveRoomTitle = (roomName?: string): string | undefined =>
    roomName ? rooms[roomName]?.title : undefined;

  const formatDate = (value?: string) => {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
      }).format(new Date(value));
    } catch {
      return '';
    }
  };

  const mediaItems = items.filter((f) => getFileCategory(f.mimetype) === 'media');
  const otherItems = items.filter((f) => getFileCategory(f.mimetype) !== 'media');

  const requestDelete = (file: ApiFile) => setConfirmingId(file._id);
  const cancelDelete = () => setConfirmingId(null);
  const confirmDelete = (file: ApiFile) => {
    setConfirmingId(null);
    onDelete(file);
  };

  return (
    <>
      {mediaItems.length > 0 && (
        <Grid>
          {mediaItems.map((file) => (
            <Thumb
              key={file._id}
              role="button"
              tabIndex={0}
              onClick={() => onPreview(file)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPreview(file);
                }
              }}
              aria-label={file.originalname}
              title={file.originalname}
            >
              <ThumbImage
                src={appendFileToken(
                  file.locationPreview || file.location,
                  fileToken
                )}
                alt={file.originalname}
                loading="lazy"
              />
              {!compact && confirmingId === file._id && (
                <ThumbConfirmOverlay>
                  <ThumbConfirmText>
                    {t('files.delete.confirmTitle')}
                  </ThumbConfirmText>
                  <ThumbConfirmActions>
                    <ThumbConfirmButton
                      $danger
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(file);
                      }}
                    >
                      {t('action.yes')}
                    </ThumbConfirmButton>
                    <ThumbConfirmButton
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelDelete();
                      }}
                    >
                      {t('action.no')}
                    </ThumbConfirmButton>
                  </ThumbConfirmActions>
                </ThumbConfirmOverlay>
              )}
              {!compact && confirmingId !== file._id && (
                <ThumbDeleteButton
                  aria-label={t('files.action.delete')}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDelete(file);
                  }}
                >
                  <DeleteIcon color="#fff" />
                </ThumbDeleteButton>
              )}
            </Thumb>
          ))}
        </Grid>
      )}

      {otherItems.length > 0 && (
        <RowsContainer>
          {otherItems.map((file) => {
            const roomTitle = resolveRoomTitle(file.roomName);
            return (
              <Row key={file._id}>
                <RowIconWrap>
                  <FileIcon
                    color={resolveIconColor(config)}
                    fill={resolveIconBgColor(config)}
                  />
                </RowIconWrap>
                <RowMain
                  onClick={() => onPreview(file)}
                  aria-label={file.originalname}
                >
                  <RowName>{file.originalname}</RowName>
                  <RowMeta>
                    <RowMetaText>{formatBytes(file.size)}</RowMetaText>
                    {file.createdAt && <RowMetaText>&middot;</RowMetaText>}
                    <RowMetaText>{formatDate(file.createdAt)}</RowMetaText>
                    {roomTitle && (
                      <RoomTag title={roomTitle}>{roomTitle}</RoomTag>
                    )}
                  </RowMeta>
                </RowMain>
                <RowActions>
                  {confirmingId === file._id ? (
                    <ConfirmBar>
                      <span>{t('files.delete.confirmTitle')}</span>
                      <ConfirmButton
                        $danger
                        onClick={() => confirmDelete(file)}
                      >
                        {t('action.yes')}
                      </ConfirmButton>
                      <ConfirmButton onClick={cancelDelete}>
                        {t('action.no')}
                      </ConfirmButton>
                    </ConfirmBar>
                  ) : (
                    <>
                      <IconButton
                        aria-label={t('files.action.download')}
                        onClick={() => onDownload(file)}
                      >
                        <DownloadIcon />
                      </IconButton>
                      {!compact && (
                        <IconButton
                          aria-label={t('files.action.delete')}
                          onClick={() => requestDelete(file)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </>
                  )}
                </RowActions>
              </Row>
            );
          })}
        </RowsContainer>
      )}
    </>
  );
};

export default FilesList;

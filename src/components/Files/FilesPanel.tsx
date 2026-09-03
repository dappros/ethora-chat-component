import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled, { keyframes } from 'styled-components';
import { RootState } from '../../roomStore';
import { useMyFiles } from '../../hooks/useMyFiles';
import { ApiFile } from '../../types/types';
import { getFileCategory, isPreviewable, FileCategory } from './fileCategory';
import { withFileToken } from '../../helpers/secureFileUrl';
import FilesList from './FilesList';
import { SearchIcon, FileIcon } from '../../assets/icons';
import { useT } from '../../i18n/useT';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import {
  resolveIconColor,
  resolveIconBgColor,
} from '../../helpers/resolveIconColor';
import { setActiveFile, setActiveModal } from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 16px;
  box-sizing: border-box;
  overflow-y: auto;
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--ethora-color-bg-subtle, #f5f7fa);
  border-radius: var(--ethora-radius-md, 12px);
  padding: 8px 12px;
  margin-bottom: 10px;
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: var(--ethora-font-size, 14px);
  font-family: var(--ethora-font-family, inherit);
  color: var(--ethora-color-text, #141414);

  &::placeholder {
    color: var(--ethora-color-text-muted, #8c8c8c);
  }
`;

const Chips = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  overflow-x: auto;
`;

const Chip = styled.button<{ $active?: boolean }>`
  border: 1px solid
    ${({ $active }) =>
      $active
        ? 'var(--ethora-color-primary, #0052cd)'
        : 'var(--ethora-color-border, #e6e8ec)'};
  background: ${({ $active }) =>
    $active ? 'var(--ethora-color-primary-soft, #e7edf9)' : 'transparent'};
  color: ${({ $active }) =>
    $active
      ? 'var(--ethora-color-primary, #0052cd)'
      : 'var(--ethora-color-text-secondary, #5a5f66)'};
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, ease);

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const SkeletonRow = styled.div`
  height: 52px;
  border-radius: var(--ethora-radius-sm, 8px);
  background: var(--ethora-color-bg-subtle, #f5f7fa);
  margin-bottom: 8px;
  animation: ${fadeIn} var(--ethora-motion-base, 220ms)
    var(--ethora-motion-ease, ease);

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const StateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const StateTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--ethora-color-text, #141414);
`;

const StateSubtitle = styled.div`
  font-size: 13px;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const RetryButton = styled.button`
  margin-top: 4px;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  background: var(--ethora-color-bg, #fff);
  color: var(--ethora-color-primary, #0052cd);
  border-radius: var(--ethora-radius-sm, 8px);
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: var(--ethora-color-bg-subtle, #f5f7fa);
  }
`;

const LoadMoreButton = styled.button`
  align-self: center;
  margin-top: 8px;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  background: var(--ethora-color-bg, #fff);
  color: var(--ethora-color-text, #141414);
  border-radius: var(--ethora-radius-sm, 8px);
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--ethora-color-bg-subtle, #f5f7fa);
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const FILTERS: { key: 'all' | FileCategory; labelKey: string }[] = [
  { key: 'all', labelKey: 'files.filter.all' },
  { key: 'media', labelKey: 'files.filter.media' },
  { key: 'documents', labelKey: 'files.filter.documents' },
  { key: 'audio', labelKey: 'files.filter.audio' },
];

const FilesPanel: React.FC = () => {
  const t = useT();
  const { config } = useChatSettingState();
  const dispatch = useDispatch();
  const [filter, setFilter] = useState<'all' | FileCategory>('all');
  const [search, setSearch] = useState('');

  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );

  const { items, loading, loadingMore, error, hasMore, loadMore, refresh, remove } =
    useMyFiles();

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((file) => {
      if (filter !== 'all' && getFileCategory(file.mimetype) !== filter) {
        return false;
      }
      if (query && !file.originalname?.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [items, filter, search]);

  const handlePreview = (file: ApiFile) => {
    // Images/videos/PDFs open through the same in-app preview modal used
    // for message attachments (see MessageImage.tsx's handleOpen) - the
    // modal handles the fileToken itself, so it gets the raw location, not
    // a pre-tokened URL. Anything else (docx, zip, ...) isn't renderable by
    // that modal, so it keeps opening in a new tab.
    if (isPreviewable(file)) {
      dispatch(
        setActiveFile({
          fileName: file.originalname,
          fileURL: file.location,
          mimetype: file.mimetype || '',
        })
      );
      dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
      return;
    }
    const url = withFileToken(file.location);
    if (url && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDownload = (file: ApiFile) => {
    const url = withFileToken(file.location);
    if (!url || typeof document === 'undefined') return;
    const link = document.createElement('a');
    link.href = url;
    link.download = file.originalname || 'file';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDelete = (file: ApiFile) => {
    remove(file._id).catch(() => {
      // Error surfaced via the hook's `error` state; nothing else to do here.
    });
  };

  return (
    <Container>
      <SearchBar>
        <SearchIcon />
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('files.search.placeholder')}
          aria-label={t('files.search.placeholder')}
        />
      </SearchBar>

      <Chips>
        {FILTERS.map(({ key, labelKey }) => (
          <Chip
            key={key}
            $active={filter === key}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
          >
            {t(labelKey)}
          </Chip>
        ))}
      </Chips>

      {loading && items.length === 0 ? (
        <div>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : error && items.length === 0 ? (
        <StateContainer>
          <StateTitle>{t('files.error.title')}</StateTitle>
          <RetryButton onClick={refresh}>{t('files.action.retry')}</RetryButton>
        </StateContainer>
      ) : visibleItems.length === 0 ? (
        <StateContainer>
          <FileIcon
            color={resolveIconColor(config)}
            fill={resolveIconBgColor(config)}
          />
          <StateTitle>
            {items.length === 0
              ? t('files.empty.title')
              : t('files.noResults')}
          </StateTitle>
          {items.length === 0 && (
            <StateSubtitle>{t('files.empty.subtitle')}</StateSubtitle>
          )}
          {items.length > 0 && hasMore && (
            <>
              {/* Filtering is client-side over the pages loaded so far, so
                  "nothing matches" is only true for what we have; offer the
                  next page instead of a confidently wrong empty state. */}
              <StateSubtitle>{t('files.noResults.moreAvailable')}</StateSubtitle>
              <LoadMoreButton onClick={loadMore} disabled={loadingMore}>
                {t('files.action.loadMore')}
              </LoadMoreButton>
            </>
          )}
        </StateContainer>
      ) : (
        <>
          <FilesList
            items={visibleItems}
            fileToken={fileToken}
            onPreview={handlePreview}
            onDownload={handleDownload}
            onDelete={handleDelete}
          />
          {hasMore && (
            <LoadMoreButton onClick={loadMore} disabled={loadingMore}>
              {t('files.action.loadMore')}
            </LoadMoreButton>
          )}
        </>
      )}
    </Container>
  );
};

export default FilesPanel;

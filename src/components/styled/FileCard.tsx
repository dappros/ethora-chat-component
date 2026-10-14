import React, { forwardRef } from 'react';
import styled from 'styled-components';
import { DownloadIcon } from '../../assets/icons';

const Card = styled.button<{ $compact: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  /* Fills the media block it sits in (AttachmentList sets that width).
     Written as width: 0 + min-width: 100% rather than width: 100%: a
     percentage width contributes the card's whole nowrap file name to the
     bubble's intrinsic width and blew bubbles up to their max-width, while
     this contributes nothing and still stretches to the block. */
  width: 0;
  min-width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: ${({ $compact }) => ($compact ? '6px 8px' : '8px 10px')};
  font: inherit;
  color: inherit;
  text-align: start;
  cursor: pointer;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-md, 14px);
  background-color: var(--ethora-color-bg-subtle, #f3f6fc);
  transition: background-color 150ms cubic-bezier(0.2, 0.8, 0.2, 1);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

/** Square tile holding the file-type glyph or a page thumbnail. */
const IconTile = styled.span<{ $tone: 'pdf' | 'neutral' }>`
  flex: 0 0 auto;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  overflow: hidden;
  border-radius: 10px;
  color: ${({ $tone }) =>
    $tone === 'pdf' ? '#d93025' : 'var(--ethora-color-primary, #0052cd)'};
  background-color: ${({ $tone }) =>
    $tone === 'pdf' ? 'rgba(217, 48, 37, 0.1)' : 'var(--ethora-color-primary-soft, #e7edf9)'};

  [data-ethora-color-scheme='dark'] & {
    color: ${({ $tone }) => ($tone === 'pdf' ? '#f2766b' : 'var(--ethora-color-primary-text, #6f9cff)')};
    background-color: ${({ $tone }) =>
      $tone === 'pdf' ? 'rgba(242, 118, 107, 0.16)' : 'rgba(111, 156, 255, 0.14)'};
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }
`;

const Body = styled.span`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
`;

const Name = styled.span`
  max-width: 100%;
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  color: var(--ethora-color-text, #141414);
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const Meta = styled.span`
  display: flex;
  flex-wrap: nowrap;
  max-width: 100%;
  overflow: hidden;
  font-size: var(--ethora-font-size-sm, 12px);
  color: var(--ethora-color-text-secondary, #53575a);
  white-space: nowrap;
`;

const MetaPart = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;

  & + &::before {
    content: '\\00b7';
    margin: 0 5px;
    color: var(--ethora-color-text-muted, #6c6c6c);
  }
`;

/** Subtle affordance on the right: the card opens the preview, which downloads. */
const Affordance = styled.span`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: var(--ethora-color-text-secondary, #53575a);
  background-color: var(--ethora-color-bg, #ffffff);
  opacity: 0.75;
  transition: opacity 150ms ease;

  ${Card}:hover & {
    opacity: 1;
  }
`;

export interface FileCardProps {
  /** Full file name; the card truncates it with an ellipsis. */
  name: string;
  /** Short parts shown under the name, joined with a middle dot. */
  meta: Array<string | undefined>;
  icon: React.ReactNode;
  tone?: 'pdf' | 'neutral';
  compact?: boolean;
  onOpen: () => void;
  title?: string;
  'aria-label'?: string;
}

/**
 * A file that is not an image or video: a tile with the type glyph, the name
 * with an ellipsis, a small meta line and a download affordance. One click
 * opens the file in the preview modal.
 */
const FileCard = forwardRef<HTMLButtonElement, FileCardProps>(
  ({ name, meta, icon, tone = 'neutral', compact = false, onOpen, title, ...rest }, ref) => {
    const parts = meta.filter((part): part is string => Boolean(part));
    return (
      <Card
        ref={ref}
        type="button"
        $compact={compact}
        onClick={onOpen}
        title={title ?? name}
        aria-label={rest['aria-label']}
      >
        <IconTile $tone={tone}>{icon}</IconTile>
        <Body>
          <Name>{name}</Name>
          {parts.length > 0 && (
            <Meta>
              {parts.map((part, index) => (
                <MetaPart key={`${index}-${part}`}>{part}</MetaPart>
              ))}
            </Meta>
          )}
        </Body>
        <Affordance aria-hidden="true">
          <DownloadIcon color="currentColor" width={14} height={14} />
        </Affordance>
      </Card>
    );
  }
);

FileCard.displayName = 'FileCard';

export default FileCard;

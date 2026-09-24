import React from 'react';
import styled from 'styled-components';
import { MentionCandidate } from '../../helpers/mentions';
import { useT } from '../../i18n/useT';
import { fadeInUpAnimation } from '../../styles/motion';

const Dropdown = styled.div`
  position: absolute;
  bottom: 100%;
  left: 16px;
  right: 16px;
  margin-bottom: 8px;
  background: var(--ethora-input-bg, var(--ethora-color-bg, #fff));
  border-radius: var(--ethora-radius-md, 12px);
  box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.15);
  max-height: 220px;
  overflow-y: auto;
  z-index: 5;
  ${fadeInUpAnimation}
`;

const Row = styled.div<{ $highlighted: boolean }>`
  padding: 10px 14px;
  cursor: pointer;
  font-size: var(--ethora-font-size, 16px);
  color: var(--ethora-color-text, #141414);
  background-color: ${({ $highlighted }) =>
    $highlighted ? 'var(--ethora-hover-bg, #f0f3fb)' : 'transparent'};

  &:hover {
    background-color: var(--ethora-hover-bg, #f0f3fb);
  }

  /* #f0f3fb has no exact token; keep it in light, use bg-hover in dark. */
  [data-ethora-color-scheme='dark'] & {
    background-color: ${({ $highlighted }) =>
      $highlighted
        ? 'var(--ethora-hover-bg, var(--ethora-color-bg-hover))'
        : 'transparent'};
  }

  [data-ethora-color-scheme='dark'] &:hover {
    background-color: var(--ethora-hover-bg, var(--ethora-color-bg-hover));
  }
`;

const ShowAllRow = styled(Row)`
  color: var(--ethora-color-primary-text, var(--ethora-color-primary, #0052cd));
  font-weight: 600;
  border-top: 1px solid var(--ethora-color-border, #eee);
`;

interface MentionDropdownProps {
  candidates: MentionCandidate[];
  totalCount: number;
  hasOverflow: boolean;
  highlightedIndex: number;
  onSelect: (candidate: MentionCandidate) => void;
  onShowAll: () => void;
  onHoverIndex: (index: number) => void;
}

export const MentionDropdown: React.FC<MentionDropdownProps> = ({
  candidates,
  totalCount,
  hasOverflow,
  highlightedIndex,
  onSelect,
  onShowAll,
  onHoverIndex,
}) => {
  const t = useT();

  if (candidates.length === 0 && !hasOverflow) return null;

  return (
    <Dropdown role="listbox">
      {candidates.map((candidate, index) => (
        <Row
          key={candidate.jid}
          role="option"
          aria-selected={index === highlightedIndex}
          $highlighted={index === highlightedIndex}
          onMouseEnter={() => onHoverIndex(index)}
          onMouseDown={(event) => {
            // mousedown (not click) so this fires before the input's blur.
            event.preventDefault();
            onSelect(candidate);
          }}
        >
          {candidate.name}
        </Row>
      ))}
      {hasOverflow && (
        <ShowAllRow
          role="option"
          aria-selected={highlightedIndex === candidates.length}
          $highlighted={highlightedIndex === candidates.length}
          onMouseEnter={() => onHoverIndex(candidates.length)}
          onMouseDown={(event) => {
            event.preventDefault();
            onShowAll();
          }}
        >
          {t('mention.showAll', { count: totalCount })}
        </ShowAllRow>
      )}
    </Dropdown>
  );
};

export default MentionDropdown;

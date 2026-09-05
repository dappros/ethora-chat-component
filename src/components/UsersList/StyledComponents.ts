import styled from 'styled-components';

export const ScrollableContainer = styled.div`
  max-height: 100px;
  overflow-y: auto;
  width: 80%;
  padding: 8px;
  max-width: 80%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* Same reason StyledInput needs it: callers pass width:100% (and a
     maxHeight) meaning "match my slot", but without border-box the 8px
     padding is added on top, so this list rendered 16px wider and 16px
     taller than its slot. NewChatModal's inline picker clips its overflow,
     which cut off the rows' right edge and hid this list's own scrollbar
     entirely. */
  box-sizing: border-box;
`;

// Row height matches RoomList's ChatItem (56-60px) so lists across the
// product feel like one system rather than two differently-scaled rows.
export const UserItem = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: 8px;
  border-radius: var(--ethora-radius-sm, 8px);
  gap: 12px;
  cursor: pointer;
  background-color: ${({ $selected }) =>
    $selected ? 'var(--ethora-color-primary-soft, #e7edf9)' : 'transparent'};
  transition: background-color var(--ethora-motion-fast, 150ms);

  &:hover {
    background-color: ${({ $selected }) =>
      $selected
        ? 'var(--ethora-color-primary-soft, #e7edf9)'
        : 'var(--ethora-color-bg-hover, #f0f2f5)'};
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: -2px;
  }
`;

export const UserItemInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
`;

export const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  accent-color: var(--ethora-color-primary, #0052cd);
  cursor: pointer;
`;

export const Label = styled.span`
  font-size: var(--ethora-font-size-sm, 14px);
  color: var(--ethora-color-text, #141414);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const EmptyState = styled.div`
  padding: 24px 8px;
  text-align: center;
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-size: var(--ethora-font-size-sm, 14px);
`;

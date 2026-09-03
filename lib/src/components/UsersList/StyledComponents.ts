import styled from 'styled-components';

export const ScrollableContainer = styled.div`
  max-height: 100px;
  overflow-y: auto;
  width: 80%;
  padding: 8px;
  max-width: 80%;
`;

// Row height matches RoomList's ChatItem (56-60px) so lists across the
// product feel like one system rather than two differently-scaled rows.
export const UserItem = styled.div`
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 8px;
  border-radius: var(--ethora-radius-sm, 8px);
  gap: 8px;
  cursor: pointer;
  transition: background-color var(--ethora-motion-fast, 150ms);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }
`;

export const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  accent-color: var(--ethora-color-primary, #0052cd);
`;

export const Label = styled.span`
  font-size: var(--ethora-font-size-sm, 14px);
  color: var(--ethora-color-text, #141414);
`;

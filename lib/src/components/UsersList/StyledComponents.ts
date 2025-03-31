import styled from 'styled-components';

export const ScrollableContainer = styled.div`
  max-height: 100px;
  overflow-y: auto;
  width: 100%;
  margin: 8px 0;
`;

export const UserItem = styled.div`
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #f0f0f0;
  gap: 8px;
`;

export const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  accent-color: #0052cd;
`;

export const Label = styled.span`
  font-size: 16px;
  color: #333;
`;

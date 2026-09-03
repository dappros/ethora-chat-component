import React from 'react';
import styled from 'styled-components';
import { Line } from './StyledComponents';

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: transparent;
  gap: 16px;
`;

export const StyledLabel = styled.div`
  margin: 0;
  color: ${(props) =>
    props?.color ? props?.color : 'var(--ethora-color-text-secondary, #5A5F66)'};
  border-radius: var(--ethora-radius-full, 999px);
  padding: 5px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ethora-font-size-xs, 12px);
  line-height: 14px;
  font-weight: 600;
  background-color: var(--ethora-color-bg-subtle, #e7edf9);
  height: 24px;
  white-space: nowrap;
  margin: 10px 0px;
`;

interface NewMessageLabelProps {
  color?: string;
}

const NewMessageLabel: React.FC<NewMessageLabelProps> = ({ color }) => {
  return (
    <Container>
      <StyledLabel color={color}>New messages</StyledLabel>
    </Container>
  );
};

export default NewMessageLabel;

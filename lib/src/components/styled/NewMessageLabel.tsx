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
  color: ${(props) => (props?.color ? props?.color : '#0052CD')};
  border-radius: 118px;
  padding: 5px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 14px;
  font-weight: 600;
  background-color: #e7edf9;
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

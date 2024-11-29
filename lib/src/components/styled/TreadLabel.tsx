import React from 'react';
import styled from 'styled-components';
import { Line } from './StyledComponents';

interface DateLabelProps {
  reply: number;
  colors?: { primary?: string; secondary?: string };
}

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: transparent;
  gap: 16px;
`;

export const StyledDateLabel = styled.div<{
  primary?: string;
  secondary?: string;
}>`
  margin: 0;
  color: ${(props) => props.primary || '#0052cd'};
  border-radius: 118px;
  padding: 5px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 14px;
  font-weight: 600;
  background-color: ${(props) => props.secondary || '#e7edf9'};
  height: 24px;
  white-space: nowrap;
`;

const TreadLabel: React.FC<DateLabelProps> = ({ reply, colors }) => {

  return (
    <Container>
      <Line />
        <StyledDateLabel {...colors}>
          {reply} {reply > 1 ? 'replies' : "reply"}
        </StyledDateLabel>
      <Line />
    </Container>
  );
};

export default TreadLabel;

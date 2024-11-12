import React from 'react';
import { CustomSystemMessage } from '../styled/StyledComponents';
import styled from 'styled-components';

interface SystemMessageProps {
  messageText: string;
  colors?: { primary?: string; secondary?: string };
}

export const CustomSystemMessageText = styled.div<{
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

const SystemMessage: React.FC<SystemMessageProps> = ({
  messageText,
  colors,
}) => {
  return (
    <CustomSystemMessage>
      <CustomSystemMessageText {...colors}>
        {messageText}
      </CustomSystemMessageText>
    </CustomSystemMessage>
  );
};

export default SystemMessage;

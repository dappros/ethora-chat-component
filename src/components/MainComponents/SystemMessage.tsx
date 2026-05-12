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
  border-radius: 12px;
  padding: 5px 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  background-color: ${(props) => props.secondary || '#e7edf9'};
  min-height: 24px;
  max-width: min(90%, 2000px);
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  text-align: center;
  box-sizing: border-box;
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

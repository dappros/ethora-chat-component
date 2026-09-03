import React from 'react';
import { CustomSystemMessage } from '../styled/StyledComponents';
import styled from 'styled-components';

interface SystemMessageProps {
  messageText: string;
  colors?: { primary?: string; secondary?: string };
}

export const CustomSystemMessageText = styled.div<{
  $primary?: string;
}>`
  margin: 0;
  color: ${(props) =>
    props.$primary || 'var(--ethora-color-text-secondary, #5A5F66)'};
  border-radius: var(--ethora-radius-full, 999px);
  padding: 5px 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ethora-font-size-xs, 12px);
  line-height: 16px;
  font-weight: 600;
  /* Light chip to match the date separator. Was bound to 'secondary', which
     hosts set to a near-black text colour (#141414) -> rendered as a harsh
     black pill. */
  background-color: var(--ethora-color-bg-subtle, #e7edf9);
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
      <CustomSystemMessageText $primary={colors?.primary}>
        {messageText}
      </CustomSystemMessageText>
    </CustomSystemMessage>
  );
};

export default SystemMessage;

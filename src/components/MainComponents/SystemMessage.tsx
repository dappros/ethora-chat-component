import React from "react";
import {
  CustomSystemMessage,
  CustomSystemMessageText,
  Line,
} from "../styled/StyledComponents";

interface SystemMessageProps {
  messageText: string;
}

const SystemMessage: React.FC<SystemMessageProps> = ({ messageText }) => {
  return (
    <CustomSystemMessage>
      <Line />
      <CustomSystemMessageText>{messageText}</CustomSystemMessageText>
      <Line />
    </CustomSystemMessage>
  );
};

export default SystemMessage;

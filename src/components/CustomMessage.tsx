import React, { forwardRef } from "react";
import { IMessage } from "../types/types";
import {
  CustomMessageTimestamp,
  CustomMessageContainer,
  CustomMessageBubble,
  CustomMessageText,
  CustomUserName,
  CustomMessagePhoto,
  CustomMessagePhotoContainer,
} from "./styled/StyledComponents";
import MediaMessage from "./MediaMessage";

interface CustomMessageProps {
  message: IMessage;
  isUser: boolean;
}

const CustomMessage: React.FC<CustomMessageProps> = forwardRef<
  HTMLDivElement,
  CustomMessageProps
>(({ message, isUser }, ref) => {
  return (
    <CustomMessageContainer key={message.id} isUser={isUser} ref={ref}>
      <CustomMessagePhotoContainer>
        <CustomMessagePhoto
          src={
            message.user.avatar ||
            "https://devdevethora.ethoradev.com/assets/profilepic-4330773c.png"
          }
          alt="userIcon"
        />
      </CustomMessagePhotoContainer>
      <CustomMessageBubble isUser={isUser}>
        <CustomUserName isUser={isUser}>{message.user.name}</CustomUserName>
        {message?.isMediafile === "true" ? (
          <MediaMessage
            mimeType={message.mimetype}
            messageText={message.locationPreview}
            location={message?.location}
            message={message}
          />
        ) : (
          <CustomMessageText>{message.body}</CustomMessageText>
        )}
        <CustomMessageTimestamp>
          {new Date(message.date).toLocaleTimeString()}
        </CustomMessageTimestamp>
      </CustomMessageBubble>
    </CustomMessageContainer>
  );
});

export default CustomMessage;

import React, { forwardRef } from "react";
import { IConfig, IMessage } from "../types/types";
import {
  CustomMessageTimestamp,
  CustomMessageContainer,
  CustomMessageBubble,
  CustomMessageText,
  CustomUserName,
  CustomMessagePhoto,
  CustomMessagePhotoContainer,
} from "./styled/StyledComponents";
import MediaMessage from "./MainComponents/MediaMessage";

interface CustomMessageProps {
  message: IMessage;
  isUser: boolean;
  config: IConfig;
}

const CustomMessage: React.FC<CustomMessageProps> = forwardRef<
  HTMLDivElement,
  CustomMessageProps
>(({ message, isUser, config }, ref) => {
  return (
    <CustomMessageContainer key={message.id} isUser={isUser} ref={ref}>
      <CustomMessagePhotoContainer>
        <CustomMessagePhoto
          src={
            // message.user.avatar ||
            "https://soccerpointeclaire.com/wp-content/uploads/2021/06/default-profile-pic-e1513291410505.jpg"
          }
          alt="userIcon"
        />
      </CustomMessagePhotoContainer>
      <CustomMessageBubble isUser={isUser}>
        {isUser && (
          <CustomUserName isUser={isUser} color={config?.colors?.primary}>
            {message.user.name}
          </CustomUserName>
        )}
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
          {message?.pending && "sending..."}
          {new Date(message.date).toLocaleTimeString()}
        </CustomMessageTimestamp>
      </CustomMessageBubble>
    </CustomMessageContainer>
  );
});

export default CustomMessage;

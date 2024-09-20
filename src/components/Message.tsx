import React, { forwardRef, useState } from "react";
import { IMessage } from "../types/types";
import {
  CustomMessageTimestamp,
  CustomMessageContainer,
  CustomMessageBubble,
  CustomMessageText,
  CustomUserName,
  CustomMessagePhoto,
  CustomMessagePhotoContainer,
  ContextMenu,
  MenuItem,
  Overlay,
} from "./styled/StyledComponents";
import MediaMessage from "./MainComponents/MediaMessage";
import { useSelector } from "react-redux";
import { RootState } from "../roomStore";

interface CustomMessageProps {
  message: IMessage;
  isUser: boolean;
}

const CustomMessage: React.FC<CustomMessageProps> = forwardRef<
  HTMLDivElement,
  CustomMessageProps
>(({ message, isUser }, ref) => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // Open context menu on right-click
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();

    const menuWidth = 160; // Width of the context menu
    const menuHeight = 120; // Approximate height based on items

    // Get the cursor position and window dimensions
    const x = event.clientX;
    const y = event.clientY;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Adjust x if menu overflows to the right
    const adjustedX = x + menuWidth > windowWidth ? x - menuWidth : x;

    // Adjust y if menu overflows to the bottom
    const adjustedY =
      y + menuHeight > windowHeight ? windowHeight - menuHeight : y;

    setContextMenu({
      visible: true,
      x: adjustedX,
      y: adjustedY,
    });
  };

  // Close the context menu
  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  return (
    <>
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
        <CustomMessageBubble isUser={isUser} onContextMenu={handleContextMenu}>
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

      {contextMenu.visible && (
        <>
          {/* Click outside to close the context menu */}
          <Overlay onClick={closeContextMenu}>
            <ContextMenu
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={closeContextMenu}
            >
              <MenuItem onClick={() => console.log("Reply to message")}>
                Send coins
              </MenuItem>
              <MenuItem onClick={() => console.log("Send item")}>
                Send item
              </MenuItem>
              <MenuItem onClick={() => console.log("Reply")}>Reply</MenuItem>
              <MenuItem onClick={() => console.log("Copy")}>Copy</MenuItem>
              <MenuItem onClick={() => console.log("Delete")}>Delete</MenuItem>
              <MenuItem onClick={() => console.log("Report")}>Report</MenuItem>
            </ContextMenu>
          </Overlay>
        </>
      )}
    </>
  );
});

export default CustomMessage;

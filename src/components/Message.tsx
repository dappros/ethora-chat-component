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
} from "./styled/StyledComponents";
import MediaMessage from "./MainComponents/MediaMessage";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../roomStore";
import {
  ContextMenu,
  Delimeter,
  MenuItem,
  Overlay,
} from "./ContextMenu/ContextMenuComponents";
import { useXmppClient } from "../context/xmppProvider";
import { deleteRoomMessage } from "../roomStore/roomsSlice";

interface CustomMessageProps {
  message: IMessage;
  isUser: boolean;
}

const CustomMessage: React.FC<CustomMessageProps> = forwardRef<
  HTMLDivElement,
  CustomMessageProps
>(({ message, isUser }, ref) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();

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

    const menuWidth = 240; // Width of the context menu
    const menuHeight = 310; // Approximate height based on items

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

  // const handleDeleteMessage = (room: string, msgId: string) => {
  //   dispatch(deleteRoomMessage({ roomJID: room, messageId: msgId }));
  //   client.deleteMessage(room, msgId);
  // };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
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
              <MenuItem onClick={() => console.log("Send coins")}>
                Send coins
              </MenuItem>
              <Delimeter />
              <MenuItem onClick={() => console.log("Send item")}>
                Send item
              </MenuItem>
              <Delimeter />
              <MenuItem onClick={() => console.log("Reply")}>Reply</MenuItem>
              <Delimeter />
              <MenuItem
                onClick={() => {
                  console.log("Copy");
                  handleCopyMessage(message.body);
                }}
              >
                Copy
              </MenuItem>
              <Delimeter />
              <MenuItem
                onClick={() => {
                  console.log("Delete");
                  // handleDeleteMessage(message.roomJID, message.id);
                }}
              >
                Delete
              </MenuItem>
              <Delimeter />
              <MenuItem onClick={() => console.log("Report")}>Report</MenuItem>
            </ContextMenu>
          </Overlay>
        </>
      )}
    </>
  );
});

export default CustomMessage;

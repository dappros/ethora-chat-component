import styled from 'styled-components';

export const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  background-color: #f3f6fc;
  /* border: 10px solid yellow; */
`;

export const ChatContainerHeader = styled.div`
  display: flex;
  border-radius: 0px 0px 15px 15px;
  box-shadow: 1px -1px 10px 0 rgba(0, 0, 0, 0.25);
  padding: 16px;
  background-color: #fff;
  z-index: 1;
  justify-content: space-between;
`;

export const ChatContainerHeaderBoxInfo = styled.div`
  display: flex;
  gap: 8px;
  cursor: pointer;
`;

export const ChatContainerHeaderInfo = styled.div`
  text-align: start;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const ChatContainerHeaderLabel = styled.div`
  color: #141414;
  font-weight: 600;
  font-size: 16px;
`;

export const NonRoomChat = styled.div`
  height: 100%;
  width: 100%;
  align-items: center;
  display: flex;
  justify-content: center;
  background-color: #fff;
  flex-direction: column;
  gap: 16;
`;

export const MessagesScroll = styled.div<{ color?: string }>`
  position: relative;
  height: calc(100%);
  overflow: hidden;
  overflow-y: scroll;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #f3f6fc;
  padding: 0px 16px;

  transition: height 0.3s ease-in-out; /* Smooth height transition */

  /* WebKit-based browsers (Chrome, Safari) */
  ::-webkit-scrollbar {
    width: 4px; /* Width of the scrollbar */
  }

  ::-webkit-scrollbar-thumb {
    background-color: ${(props) => (props?.color ? props?.color : '#0052CD')};
    border-radius: 6px; /* Rounded corners for the thumb */
  }

  ::-webkit-scrollbar-track {
    background-color: #f0f0f0; /* Background color of the track */
  }

  /* Firefox */
  scrollbar-width: thin; /* Make the scrollbar thinner */
  scrollbar-color: ${(props) => (props?.color ? props?.color : '#0052CD')}
    #f0f0f0; /* Color of the thumb and track */
`;

export const MessagesList = styled.div`
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  min-height: 1.25em;
  position: relative;
  color: #000000de;
`;

export const MessageTimestamp = styled.div`
  font-size: 0.75rem;
  color: #666;
  margin-bottom: 5px;
`;

export const Message = styled.div<{ isUser: boolean }>`
  background-color: ${(props) => (props.isUser ? '#dcf8c6' : '#f1f1f1')};
  padding: 10px;
  margin: 10px 0;
  border-radius: 8px;
  max-width: 60%;
  flex-direction: ${(props) => (!props.isUser ? 'row' : 'row-reverse')};
`;

export const MessageText = styled.p`
  margin: 0;
`;

export const UserName = styled.span`
  font-weight: bold;
`;

export const InputContainer = styled.div`
  display: flex;
  border-radius: 15px 15px 0px 0px;
  background-color: #fff;
  flex-direction: column;
  gap: 5px;
`;

export const MessageInput = styled.input`
  flex-grow: 1;
  padding: 10px;
  border-radius: 8px;
  border: none;
  margin-right: 10px;
`;

export const SendButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background-color: #007bff;
  color: black;
  cursor: pointer;
  box-shadow: 1px -1px 10px 0 rgba(0, 0, 0, 0.25);

  &:hover {
    background-color: #0056b3;
  }
`;
//
//
//
export const CustomMessageContainer = styled.div<{
  isUser: boolean;
  reply: number;
}>`
  display: flex;
  flex-direction: ${(props) => (!props.isUser ? 'row' : 'row-reverse')};
  align-items: end;
  margin: 10px 0;
  gap: 5px;
  position: relative;
  margin-bottom: ${(props) => !!props.reply && '40px'};
`;

export const CustomMessageBubble = styled.div<{
  isUser: boolean;
  deleted: boolean;
}>`
  max-width: 60%;
  min-width: 15%;
  padding: 8px 16px;
  border-radius: ${(props) =>
    props.isUser ? '15px 15px 0px 15px' : '15px 15px 15px 0px'};
  background-color: #ffffff;
  color: #000000;
  text-align: left;
  display: flex;
  flex-direction: column;
  background-color: ${(props) =>
    props.deleted ? '#dfdfdf' : props.isUser ? '#E7EDF9' : '#FFFFFF'};
  position: relative;
`;

export const CustomMessageText = styled.p`
  margin: 0px;
  word-wrap: break-word;
`;

export const TranslateTextLabel = styled.p`
  font-weight: 600;
  font-size: 12px;
  color: #0052cd;
`;

export const TranslateWrapper = styled.p`
  display: flex;
  gap: 2px;
`;

export const CustomUserName = styled.span<{ isUser: boolean; color?: string }>`
  font-family: 'Open Sans', sans-serif;
  font-weight: 600;
  font-size: 18px;
  color: ${(props) =>
    props.isUser ? (props?.color ? props?.color : '#0052CD') : '#0052cd'};
  margin-bottom: 8px;
`;

export const CustomMessageTimestamp = styled.span`
  font-size: 0.75rem;
  align-self: flex-end;
  color: #8f8f8f;
`;

export const CustomMessagePhoto = styled.img`
  width: 40px;
  aspect-ratio: 1/1;
  display: block;
  margin-left: auto;
  margin-right: auto;
  border-radius: 100px;

  transition: box-shadow 0.2s ease-in-out;

  &:hover {
    box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.2);
  }
`;

export const CustomMessagePhotoContainer = styled.div`
  cursor: pointer;
  margin: 0;
`;

export const CustomSystemMessage = styled.div`
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: transparent;
  gap: 16px;
  margin: 8px;
`;

export const CustomSystemMessageText = styled.p`
  margin: 0;
  color: #000000;
  margin: 10px;
  white-space: nowrap;
`;

export const IconButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: gray;
  font-size: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
`;

export const Line = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: transparent;
  border: 1px solid var(--colors-background-bg-prymary-5, #0052cd0d);
`;

export const StyledLoaderWrapper = styled.div`
  height: 100%;
  display: flex;
  justify-content: center;
`;

export const OrDelimiter = styled.div`
  text-align: center;
  position: relative;
  width: 100%;
  font-size: 14px;
  color: #999;

  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 45%;
    height: 1px;
    background: #ccc;
  }

  &::before {
    left: 0;
  }

  &::after {
    right: 0;
  }
`;

export const AlsoContainer = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  background-color: #0052cd0d;
  font-size: 14px;
  padding: 10px 28px;
  text-align: start;
`;

export const AlsoCheckbox = styled.input<{ accentColor: string }>`
  width: 16px;
  height: 16px;
  border-radius: #0052cd;
  accent-color: #5e3fde;
  accent-color: ${(props) => props.accentColor};
`;

export const Wrapper = styled.div<{
  bgColor: string;
  size?: number;
  isClickable: boolean;
}>`
  width: ${({ size }) => `${size}px` || '64px'};
  height: ${({ size }) => `${size}px` || '64px'};
  border-radius: 50%;
  background-color: ${({ bgColor }) => bgColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  cursor: ${({ isClickable }) => (isClickable ? 'pointer' : 'default')};
  position: relative;
`;

export const AvatarCircle = styled.div<{
  bgColor: string;
  size?: number;
  isClickable: boolean;
}>`
  width: ${({ size }) => `${size}px` || '64px'};
  height: ${({ size }) => `${size}px` || '64px'};
  border-radius: 50%;
  background-color: ${({ bgColor }) => bgColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  cursor: ${({ isClickable }) => (isClickable ? 'pointer' : 'default')};
  overflow: hidden;
`;

export const AvatarImage = styled.img<{ size?: number }>`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

export const RemoveButton = styled.button`
  position: absolute;
  top: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 0;
  padding: 0;
`;

export const FileInput = styled.input`
  display: none;
`;

export const Overlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  border-radius: 50%;
  &:hover {
    background-color: rgba(0, 0, 0, 0.7);
  }
`;

import styled from "styled-components";

export const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  background-color: #e8edf2;
  /* border: 10px solid yellow; */
`;

export const ChatContainerHeader = styled.div`
  display: flex;
  border-radius: 0px 0px 15px 15px;
  box-shadow: 1px -1px 10px 0 rgba(0, 0, 0, 0.25);
  padding: 30px 11px;
  background-color: #fff;
  flex-direction: column;
  z-index: 1;
`;

export const ChatContainerHeaderLabel = styled.div`
  color: #0052cd;
  font-weight: 600;
  font-size: 18px;
`;

export const MessagesScroll = styled.div`
  position: relative;
  height: 100%;
  overflow-y: scroll;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 1.2em 0 0.8em;
  background-color: #e8edf2;
`;

export const MessagesList = styled.div`
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  min-height: 1.25em;
  position: relative;
  color: #000000de;
  background-color: #fff;
`;

export const MessageTimestamp = styled.div`
  font-size: 0.75rem;
  color: #666;
  margin-bottom: 5px;
`;

export const Message = styled.div<{ isUser: boolean }>`
  background-color: ${(props) => (props.isUser ? "#dcf8c6" : "#f1f1f1")};
  padding: 10px;
  margin: 10px 0;
  border-radius: 8px;
  max-width: 60%;
  flex-direction: ${(props) => (!props.isUser ? "row" : "row-reverse")};
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
  padding: 30px 11px;
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
export const CustomMessageContainer = styled.div<{ isUser: boolean }>`
  display: flex;
  flex-direction: ${(props) => (!props.isUser ? "row" : "row-reverse")};
  align-items: end;
  margin: 10px 0;
  gap: 5px;
`;

export const CustomMessageBubble = styled.div<{ isUser: boolean }>`
  max-width: 60%;
  padding: 12px 8px;
  border-radius: ${(props) =>
    props.isUser ? "15px 15px 0px 15px" : "15px 15px 15px 0px"};
  background-color: #ffffff;
  color: #000000;
  text-align: left;
  display: flex;
  flex-direction: column;
`;

export const CustomMessageText = styled.p`
  margin: 0;
  word-wrap: break-word;
`;

export const CustomUserName = styled.span<{ isUser: boolean }>`
  font-family: "Open Sans", sans-serif;
  font-weight: 600;
  font-size: 18px;
  color: ${(props) => (props.isUser ? "#12B829" : "#0052cd")};
`;

export const CustomMessageTimestamp = styled.span`
  font-size: 0.75rem;
  align-self: flex-end;
  color: #8f8f8f;
`;

export const CustomMessagePhoto = styled.img`
  width: 45px;
  aspect-ratio: 1/1;
  display: block;
  margin-left: auto;
  margin-right: auto;
  border-radius: 100px;
`;

export const CustomMessagePhotoContainer = styled.div`
  margin: 0;
`;

export const CustomSystemMessage = styled.div`
  width: 100%;
  text-align: center;
`;

export const CustomSystemMessageText = styled.p`
  margin: 0;
  word-wrap: break-word;
  color: #000000;
  margin: 10px;
`;

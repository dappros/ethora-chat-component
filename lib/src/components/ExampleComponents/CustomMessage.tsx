import React from "react";
import styled from "styled-components";

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

const CustomMessage = () => {
  return <div>CustomMessage</div>;
};

export default CustomMessage;

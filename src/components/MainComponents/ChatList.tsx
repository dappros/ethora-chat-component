import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Message,
  UserName,
  MessageText,
  MessageTimestamp,
  MessagesScroll,
} from "../styled/StyledComponents";
import { IMessage, IRoom, User } from "../../types/types";
import SystemMessage from "./SystemMessage";
import DateLabel from "../styled/DateLabel";
import Loader from "../styled/Loader";

interface ChatListProps<TMessage extends IMessage> {
  messages: TMessage[];
  CustomMessage?: React.ComponentType<{ message: TMessage; isUser: boolean }>;
  user: User;
  room: IRoom;
  loadMoreMessages: (
    chatJID: string,
    max: number,
    amount?: number
  ) => Promise<void>;
}

const ChatList = <TMessage extends IMessage>({
  messages,
  CustomMessage,
  user,
  loadMoreMessages,
  room,
}: ChatListProps<TMessage>) => {
  const validateMessages = (messages: TMessage[]): boolean => {
    const requiredAttributes: (keyof IMessage)[] = [
      "id",
      "user",
      "date",
      "body",
    ];
    let isValid = true;
    messages.forEach((message, index) => {
      const missingAttributes = requiredAttributes.filter(
        (attr) => !(attr in message)
      );
      if (missingAttributes.length > 0) {
        console.error(
          `Message at index ${index} is missing attributes: ${missingAttributes.join(
            ", "
          )}`
        );
        isValid = false;
      }
    });
    return isValid;
  };

  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (containerRef.current && !loading) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isScrolledToBottom = scrollHeight - scrollTop <= clientHeight + 30;

      if (isScrolledToBottom) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }
  }, [messages, loading]);

  const handleScroll = useCallback(async () => {
    if (containerRef.current && !loading) {
      const { scrollTop, scrollHeight } = containerRef.current;
      if (scrollTop <= 30) {
        setLoading(true);
        const currentScrollHeight = scrollHeight;

        await loadMoreMessages(room.jid, 30, Number(messages[0].id));
        setLoading(false);

        setTimeout(() => {
          if (containerRef.current) {
            const newScrollHeight = containerRef.current.scrollHeight;
            containerRef.current.scrollTop =
              newScrollHeight - currentScrollHeight + scrollTop;
          }
        }, 0);
      }
    }
  }, [loading, loadMoreMessages, room.jid, messages]);

  if (!validateMessages(messages)) {
    console.log("Invalid 'messages' props provided to ChatList.");
    return null;
  }

  let lastDateLabel: string | null = null;

  return (
    <MessagesScroll ref={containerRef} onScroll={handleScroll}>
      {loading && <Loader />}
      {messages.map((message) => {
        const isUser = message.user.id === user.walletAddress;
        const messageDate = new Date(message.date);
        const currentDateLabel = messageDate.toDateString();

        const showDateLabel = currentDateLabel !== lastDateLabel;
        if (showDateLabel) {
          lastDateLabel = currentDateLabel;
        }

        if (message.isSystemMessage === "true") {
          return (
            <React.Fragment key={message.id}>
              {showDateLabel && <DateLabel date={messageDate} />}
              <SystemMessage messageText={message.body} />
            </React.Fragment>
          );
        }

        const MessageComponent = CustomMessage || Message;

        return (
          <React.Fragment key={message.id}>
            {showDateLabel && <DateLabel date={messageDate} />}
            <MessageComponent message={message} isUser={isUser}>
              {!CustomMessage && (
                <>
                  <MessageTimestamp>
                    {messageDate.toLocaleTimeString()}
                  </MessageTimestamp>
                  <UserName>{message.user.name}: </UserName>
                  <MessageText>{message.body}</MessageText>
                </>
              )}
            </MessageComponent>
          </React.Fragment>
        );
      })}
    </MessagesScroll>
  );
};

export default ChatList;

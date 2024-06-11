import React, { useEffect, useRef, useCallback } from "react";
import {
  MessagesList,
  Message,
  UserName,
  MessageText,
  MessageTimestamp,
  MessagesScroll,
} from "./styled/StyledComponents";
import { IMessage, IRoom, User } from "../types/types";
import SystemMessage from "./SystemMessage";
import DateLabel from "./styled/DateLabel";
import { blockScrollEvent } from "../helpers/block_scroll";

interface ChatListProps<TMessage extends IMessage> {
  messages: TMessage[];
  CustomMessage?: React.ComponentType<{ message: TMessage; isUser: boolean }>;
  user: User;
  room: IRoom;
  loadMoreMessages: (
    chatJID: string,
    firstUserMessageID: string,
    amount: number
  ) => Promise<void>;
}

const ChatList = <TMessage extends IMessage>({
  messages,
  CustomMessage,
  user,
  loadMoreMessages,
  room,
}: ChatListProps<TMessage>) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  const timeoutRef = useRef<number>(0);
  const scrollParams = useRef<{ top: number; height: number } | null>(null);
  const isLoadingMore = useRef<boolean>(false);

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

  const scrollToBottom = (): void => {
    const content = contentRef.current;
    if (content) {
      const height = content.clientHeight;
      const scroll_height = content.scrollHeight;

      if (scroll_height > height) {
        content.scrollTop = scroll_height - height;
      }
    }
  };

  const getScrollParams = (): { top: number; height: number } | null => {
    const content = contentRef.current;
    if (!content) {
      return null;
    }
    return {
      top: content.scrollTop,
      height: content.scrollHeight,
    };
  };

  const blockScroll = () => {
    const content = contentRef.current;
    if (content) {
      blockScrollEvent(content);
    }
  };

  const checkIfLoadMoreMessages = () => {
    const params = getScrollParams();
    if (!params) return;

    if (params.top < 150 && !isLoadingMore.current) {
      scrollParams.current = getScrollParams();
      const firstMessage = messages[0];
      if (firstMessage?.user?.id) {
        isLoadingMore.current = true;

        loadMoreMessages(messages[0].roomJID, messages[0].user.id, 30).finally(
          () => {
            isLoadingMore.current = false;
          }
        );
      }
    }
  };

  const onScroll = () => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => checkIfLoadMoreMessages(), 50);
  };

  useEffect(() => {
    scrollToBottom();
    blockScroll();

    const messagesOuter = outerRef.current;

    if (messagesOuter) {
      messagesOuter.addEventListener("scroll", onScroll, true);
    }

    return () => {
      messagesOuter &&
        messagesOuter.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  useEffect(() => {
    if (messages.length < 30) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (messages && messages.length > 30) {
      if (scrollParams.current) {
        const _scrollParams = getScrollParams();

        if (_scrollParams && contentRef.current) {
          const scrollTop =
            scrollParams.current.top +
            (_scrollParams.height - scrollParams.current.height);
          contentRef.current.scrollTop = scrollTop;
        }

        scrollParams.current = null;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (messages && messages.length > 30) {
      if (scrollParams.current) {
        const _scrollParams = getScrollParams();

        if (_scrollParams && contentRef.current) {
          const scrollTop =
            scrollParams.current.top +
            (_scrollParams.height - scrollParams.current.height);
          contentRef.current.scrollTop = scrollTop;
        }

        scrollParams.current = null;
      }
    }
  }, [messages]);

  if (!validateMessages(messages)) {
    console.log("Invalid 'messages' props provided to ChatList.");
    return null;
  }

  let lastDateLabel: string | null = null;

  return (
    <MessagesList ref={outerRef}>
      <MessagesScroll ref={contentRef}>
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
    </MessagesList>
  );
};

export default ChatList;

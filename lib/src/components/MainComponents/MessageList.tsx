import React, { useEffect, useRef } from "react";
import {
  Message,
  UserName,
  MessageText,
  MessageTimestamp,
  MessagesScroll,
  MessagesList,
} from "../styled/StyledComponents";
import { IConfig, IMessage, IRoom, User } from "../../types/types";
import SystemMessage from "./SystemMessage";
import DateLabel from "../styled/DateLabel";
import Loader from "../styled/Loader";
import { useSelector } from "react-redux";
import { RootState } from "../../roomStore";
import Composing from "../styled/StyledInputComponents/Composing";
import { validateMessages } from "../../helpers/validator";
import NewMessageLabel from "../styled/NewMessageLabel";

interface MessageListProps<TMessage extends IMessage> {
  messages: TMessage[];
  CustomMessage?: React.ComponentType<{ message: TMessage; isUser: boolean }>;
  user: User;
  room: IRoom;
  loadMoreMessages: (
    chatJID: string,
    max: number,
    amount?: number
  ) => Promise<void>;
  loading: boolean;
  config?: IConfig;
}
const MessageList = <TMessage extends IMessage>({
  messages,
  CustomMessage,
  user,
  loadMoreMessages,
  room,
  config,
  loading,
}: MessageListProps<TMessage>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<IMessage>(messages[messages.length - 1]);
  const isLoadingMore = useRef<boolean>(false);

  const timeoutRef = useRef<number>(0);
  const scrollParams = useRef<{ top: number; height: number } | null>(null);
  const { composing, lastViewedTimestamp } = useSelector(
    (state: RootState) => state.rooms.rooms[room.jid]
  );

  const getScrollParams = (): { top: number; height: number } | null => {
    const content = containerRef.current;
    if (!content) return null;

    return {
      top: content.scrollTop,
      height: content.scrollHeight,
    };
  };

  const restoreScrollPosition = () => {
    const content = containerRef.current;
    if (content && scrollParams.current) {
      const { top, height } = scrollParams.current;
      const newHeight = content.scrollHeight;
      const scrollTop = top + (newHeight - height);
      content.scrollTop = scrollTop;
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

        loadMoreMessages(
          messages[0].roomJID,
          30,
          Number(messages[0].id)
        ).finally(() => {
          isLoadingMore.current = false;
          lastMessageRef.current = messages[messages.length - 1];
          restoreScrollPosition();
        });
      }
    }
  };

  const onScroll = () => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => checkIfLoadMoreMessages(), 50);
  };

  useEffect(() => {
    const messagesOuter = outerRef.current;
    if (messagesOuter) {
      messagesOuter.addEventListener("scroll", onScroll, true);
    }
    return () => {
      messagesOuter?.removeEventListener("scroll", onScroll, true);
    };
  }, [composing]);

  useEffect(() => {
    if (messages.length > 30) {
      restoreScrollPosition();
    } else {
      const scrollToBottom = (): void => {
        const content = containerRef.current;
        if (content) {
          content.scrollTop = content.scrollHeight;
        }
      };

      scrollToBottom();
    }
  }, [messages.length, composing]);

  useEffect(() => {
    const content = containerRef.current;
    if (!content) return;

    const totalHeight = content.scrollHeight;
    const currentScrollPosition = content.scrollTop + content.clientHeight;

    const isCloseToBottom = currentScrollPosition >= totalHeight * 0.9;

    const lastMessageUser =
      messages[messages.length - 1].user.userJID === user.walletAddress;
    if (isCloseToBottom || lastMessageUser) {
      content.scrollTop = totalHeight;
    }
  }, [messages.length, composing]);

  if (!validateMessages(messages)) {
    console.log("Invalid 'messages' props provided to MessageList.");
    return null;
  }

  let lastDateLabel: string | null = null;

  return (
    <MessagesList ref={outerRef}>
      <MessagesScroll
        ref={containerRef}
        onScroll={onScroll}
        color={config?.colors?.primary}
      >
        {loading && <Loader color={config?.colors?.primary} />}
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
                {showDateLabel && (
                  <DateLabel date={messageDate} colors={config?.colors} />
                )}
                <SystemMessage messageText={message.body} />
              </React.Fragment>
            );
          }

          // todo finish unread messages
          if (message.id === "delimiter-new" && lastViewedTimestamp) {
            return <NewMessageLabel color={config?.colors?.primary} />;
          }

          const MessageComponent = CustomMessage || Message;

          return (
            <React.Fragment key={message.id}>
              {showDateLabel && message.id !== "delimiter-new" && (
                <DateLabel date={messageDate} colors={config?.colors} />
              )}
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
        {composing && <Composing usersTyping={["User"]} />}
      </MessagesScroll>
    </MessagesList>
  );
};

export default MessageList;

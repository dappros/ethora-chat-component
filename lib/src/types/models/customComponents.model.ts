import React from 'react';
import { IConfig, IMessage, MessageProps } from '../types';
import { SendInputProps } from '../../components/styled/SendInput';

export interface DaySeparatorProps {
  date: Date;
  formattedDate: string;
}

export interface DecoratedMessage {
  message: IMessage;
  showDateLabel: boolean;
}

export interface ScrollControllerApi {
  scrollToBottom: () => void;
  waitForImagesLoaded: () => Promise<void>;
  showScrollButton: boolean;
  newMessagesCount: number;
  resetNewMessageCounter: () => void;
}

export interface CustomScrollableAreaProps {
  roomJID: string;
  messages: IMessage[];
  decoratedMessages: DecoratedMessage[];
  isLoading: boolean;
  isReply: boolean;
  activeMessage?: IMessage;
  loadMoreMessages: (
    chatJID: string,
    max: number,
    amount?: number
  ) => Promise<void>;
  renderMessage: (decorated: DecoratedMessage) => React.ReactNode;
  scrollController: ScrollControllerApi;
  typingIndicator?: React.ReactNode;
  config?: IConfig;
}

export interface CustomComponentsContextValue {
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  CustomInputComponent?: React.ComponentType<
    SendInputProps & {
      onSendMessage?: (message: string) => void;
      onSendMedia?: (data: any, type: string) => void;
      placeholderText?: string;
    }
  >;
  CustomScrollableArea?: React.ComponentType<CustomScrollableAreaProps>;
  CustomDaySeparator?: React.ComponentType<DaySeparatorProps>;
}

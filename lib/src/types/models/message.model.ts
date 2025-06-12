import { IUser } from './user.model';
import { TranslationObject } from '../types';

export interface IMessage {
  id: string;
  user: IUser;
  date: Date | string;
  body: string;
  roomJid: string;
  key?: string;
  coinsInMessage?: string | number;
  numberOfReplies?: number[] | number;
  isSystemMessage?: string;
  isMediafile?: string;
  locationPreview?: string;
  mimetype?: string;
  location?: string;
  pending?: boolean;
  timestamp?: number;
  showInChannel?: string;
  activeMessage?: boolean;
  isReply?: boolean | string;
  isDeleted?: boolean;
  mainMessage?: string;
  reply?: IReply[];
  reaction?: Record<string, ReactionMessage>;
  fileName?: string;
  translations?: TranslationObject;
  langSource?: string;
  originalName?: string;
  size?: string;
  xmppId?: string;
  xmppFrom?: string;
}

export interface ReactionMessage {
  emoji: string[];
  data: Record<string, string>;
}

export interface IReply extends IMessage {}

export interface MessageBubble {
  backgroundMessageUser?: string;
  backgroundMessage?: string;
  colorUser?: string;
  color?: string;
  borderRadius?: number;
}

export interface MessageProps {
  message: IMessage;
  isUser: boolean;
  isReply: boolean;
}

export interface MediaMessageType {}

export interface LastMessage extends Omit<Partial<IMessage>, 'date'> {
  body: string;
  date?: string | Date;
  emoji?: string;
  locationPreview?: string;
  filename?: string;
  mimetype?: string;
  originalName?: string;
}

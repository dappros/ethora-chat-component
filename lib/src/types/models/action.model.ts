import { IMessage } from './message.model';

export interface DeleteModal {
  isDeleteModal: boolean;
  roomJid?: string;
  messageId?: string;
}

export interface EditAction {
  isEdit: boolean;
  roomJid?: string;
  messageId?: string;
  text?: string;
}

// Consolidated ReactionAction, using the more comprehensive definition
export interface ReactionAction {
  roomJID: string;
  messageId: string;
  from: string; // Included from the first definition
  reactions: string[];
  latestReactionTimestamp?: string; // Included from the first definition
  data?: Record<string, string>; // Included from the first definition
}

export interface AddRoomMessageAction {
  roomJID: string;
  message: IMessage;
  start?: boolean;
}

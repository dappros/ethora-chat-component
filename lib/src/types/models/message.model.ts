import { IUser } from './user.model';
import { TranslationObject } from '../types';
import { Iso639_1Codes } from './language.model';
import { IAttachment } from './attachment.model';

export interface IMessage {
  id: string;
  user: IUser;
  date: Date | string;
  messageTimestampMs?: number;
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
  // Set by the send-failure watchdog when the MUC never reflected this
  // message back within SEND_FAILURE_TIMEOUT_MS. It is a DISPLAY state
  // only: the server may still have accepted the message, so a late echo
  // clears it again (see addRoomMessage). Never treat `failed` as proof
  // the message was not delivered - only as "we have no confirmation yet
  // and the user should be offered a retry".
  failed?: boolean;
  timestamp?: number;
  showInChannel?: string;
  activeMessage?: boolean;
  isReply?: boolean | string;
  isDeleted?: boolean;
  isEdited?: boolean;
  mainMessage?: string;
  reply?: IReply[];
  reaction?: Record<string, ReactionMessage>;
  fileName?: string;
  translations?: TranslationObject;
  langSource?: Iso639_1Codes;
  originalName?: string;
  size?: string;
  /**
   * Every file carried by this message, oldest wire format included:
   * `attachments[0]` mirrors the flat `location`/`mimetype`/`originalName`
   * fields above. Undefined on messages that predate multi-attach, so read
   * it through `getMessageAttachments()` rather than directly.
   */
  attachments?: IAttachment[];
  xmppId?: string;
  xmppFrom?: string;
  // @-mentions carried by this message's body, decoded from the `mentions`
  // JSON attribute on the stanza's <data> element (see getDataFromXml.ts).
  mentions?: IMentionSpan[];
  // Present when this message is a call-log entry derived from a
  // `<data type="call-state">` stanza (see helpers/callLogMessage.ts).
  callLog?: {
    callId: string;
    direction: 'outgoing' | 'incoming';
    durationMs: number;
    missed: boolean;
    kind: 'audio' | 'video';
  };
}

export interface ReactionMessage {
  emoji: string[];
  data: Record<string, string>;
}

export interface IReply extends IMessage {}

// One @-mention span inside a message's plain-text `body`. `offset`/`length`
// index into that same body string (UTF-16 code units, matching JS string
// indexing) so the renderer can splice in a clickable mention element without
// re-parsing the text for "@Name" patterns. `jid` identifies the mentioned
// user for the profile-modal lookup on click.
export interface IMentionSpan {
  jid: string;
  name: string;
  offset: number;
  length: number;
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

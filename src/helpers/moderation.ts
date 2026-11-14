import type { Element } from 'ltx';
import type { IMessage, MessageModeration } from '../types/types';

/**
 * Trust & Safety message moderation on the wire.
 *
 * Archived messages carry the result of moderation as a child element:
 *
 *   <moderation xmlns="urn:ethora:moderation" action="blur|hidden|deleted"
 *               category="toxicity|severe|pii|phi|suspension" by="auto|moderator"/>
 *
 * and, live, the room receives a bodiless notice that points at the message
 * (or at every message of one sender):
 *
 *   <message type="groupchat">
 *     <moderation xmlns="urn:ethora:moderation" action="..." category="..."
 *                 stanza-id="<archive id>" origin-id="<client id>" user="<sender localpart>"/>
 *   </message>
 *
 * A notice is never a message of its own: it is applied to the messages
 * already in the store and dropped, so it can never become an empty bubble
 * or count as unread.
 */
export const MODERATION_XMLNS = 'urn:ethora:moderation';

/**
 * `restore` (wire: `restored`): the original is back.
 * `masked`: the sender's name is masked, the content kept.
 */
export type ModerationNoticeAction = MessageModeration['action'] | 'restore' | 'masked';

export interface ModerationNotice {
  roomJID: string;
  action: ModerationNoticeAction;
  category?: string;
  by?: string;
  /** Archive id of the target message (what MAM returns as its id). */
  stanzaId?: string;
  /** Client id the sender minted (the `id` on the original stanza). */
  originId?: string;
  /** Sender localpart: with no ids, the notice applies to all their messages. */
  user?: string;
  /** `mask-name="true"`: the sender's name is masked as well. */
  maskName?: boolean;
}

const str = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

/** The server's verbs and their nouns both map onto the three states. */
export const normalizeModerationAction = (
  raw: unknown
): ModerationNoticeAction | null => {
  switch (String(raw ?? '').trim().toLowerCase()) {
    case 'blur':
    case 'blurred':
      return 'blur';
    case 'hide':
    case 'hidden':
      return 'hidden';
    case 'delete':
    case 'deleted':
      return 'deleted';
    case 'restore':
    case 'restored':
    case 'keep':
      return 'restore';
    case 'mask':
    case 'masked':
      return 'masked';
    default:
      return null;
  }
};

const moderationChild = (element?: Element | null): Element | undefined => {
  if (!element || typeof element.getChild !== 'function') return undefined;
  return (
    element.getChild('moderation', MODERATION_XMLNS) ||
    (element.getChildren?.('moderation') || []).find(
      (child) => child?.attrs?.xmlns === MODERATION_XMLNS
    )
  );
};

const hasTargetAttrs = (element: Element): boolean =>
  Boolean(
    str(element.attrs?.['stanza-id']) ||
      str(element.attrs?.['origin-id']) ||
      str(element.attrs?.user)
  );

const hasText = (element?: Element | null): boolean =>
  Boolean(element?.getChild?.('body')?.getText?.()?.trim());

/**
 * True for a live notice: a message with no text whose `<moderation>` names
 * a target. Such a stanza is applied to other messages, never rendered.
 */
export const isModerationNotice = (stanza?: Element | null): boolean => {
  if (!stanza || stanza.name !== 'message') return false;
  const child = moderationChild(stanza);
  if (!child || !hasTargetAttrs(child)) return false;
  return !hasText(stanza);
};

/**
 * The moderation state of an archived (or live) message, or undefined when it
 * carries none. A notice is not a message's own state and returns undefined.
 */
export const parseModerationMarker = (
  message?: Element | null
): MessageModeration | undefined => {
  if (!message || isModerationNotice(message)) return undefined;
  const child = moderationChild(message);
  if (!child) return undefined;
  const action = normalizeModerationAction(child.attrs?.action);
  // `masked` changes the name, not the content: the name attributes say it.
  if (!action || action === 'restore' || action === 'masked') return undefined;
  const category = str(child.attrs?.category);
  const by = str(child.attrs?.by);
  return {
    action,
    ...(category ? { category } : {}),
    ...(by ? { by } : {}),
  };
};

/** A live notice, or null when the stanza is not one. */
export const parseModerationNotice = (
  stanza?: Element | null
): ModerationNotice | null => {
  if (!isModerationNotice(stanza)) return null;
  const child = moderationChild(stanza) as Element;
  const action = normalizeModerationAction(child.attrs?.action);
  const roomJID = String(stanza?.attrs?.from || '').split('/')[0];
  if (!action || !roomJID) return null;
  const notice: ModerationNotice = { roomJID, action };
  const category = str(child.attrs?.category);
  const by = str(child.attrs?.by);
  const stanzaId = str(child.attrs?.['stanza-id']);
  const originId = str(child.attrs?.['origin-id']);
  const user = str(child.attrs?.user);
  if (String(child.attrs?.['mask-name'] ?? '').trim().toLowerCase() === 'true') {
    notice.maskName = true;
  }
  if (category) notice.category = category;
  if (by) notice.by = by;
  if (stanzaId) notice.stanzaId = stanzaId;
  if (originId) notice.originId = originId;
  if (user) notice.user = user;
  return notice;
};

const senderLocalpart = (message: Pick<IMessage, 'user'>): string =>
  String(message?.user?.id || '')
    .split('@')[0]
    .trim()
    .toLowerCase();

/**
 * Whether a notice applies to `message`. With an id the match is exact (the
 * archive id, or the sender's client id, which is also the `xmppId` of our
 * own echoed messages); with only `user` it is every message of that sender.
 */
export const noticeTargets = (
  message: IMessage | undefined | null,
  notice: Pick<ModerationNotice, 'stanzaId' | 'originId' | 'user'>
): boolean => {
  if (!message || message.id === 'delimiter-new') return false;
  const { stanzaId, originId, user } = notice;
  if (stanzaId || originId) {
    const ids = [message.id, message.xmppId].filter(Boolean).map(String);
    return Boolean(
      (stanzaId && ids.includes(stanzaId)) ||
        (originId && ids.includes(originId))
    );
  }
  if (user) {
    return senderLocalpart(message) === user.toLowerCase();
  }
  return false;
};

/**
 * Same tombstone the `<delete>` path writes: the bubble shows the deleted
 * placeholder and keeps its place (replies, ordering) in the transcript.
 */
export const tombstoneMessage = (message: IMessage): void => {
  message.isDeleted = true;
  message.body = '';
  message.isMediafile = 'false';
  message.location = undefined;
  message.locationPreview = undefined;
  message.mimetype = undefined;
  message.fileName = undefined;
  message.attachments = undefined;
  message.reaction = undefined;
};

/** Drops everything a hidden message must not show, keeping its place. */
const stripContent = (message: IMessage): void => {
  message.body = '';
  message.isMediafile = 'false';
  message.location = undefined;
  message.locationPreview = undefined;
  message.mimetype = undefined;
  message.fileName = undefined;
  message.originalName = undefined;
  message.attachments = undefined;
  message.caption = undefined;
  message.captionMentions = undefined;
  message.mentions = undefined;
  message.translations = undefined;
  message.quickReplies = undefined;
  message.isSensitive = undefined;
};

/**
 * Applies one moderation action to a message in place (works on an immer
 * draft and on a plain object alike).
 *
 * `restore` lifts a blur and a masked name at once. A hidden or deleted
 * message has already lost its content on this client, so it keeps that
 * state until the archive copy replaces it (see moderationRefresh.ts), rather
 * than turning into an empty bubble.
 *
 * `masked`, or `maskName` with any action, masks the sender's name.
 */
export const applyModeration = (
  message: IMessage,
  action: ModerationNoticeAction,
  category?: string,
  by?: string,
  options: { maskName?: boolean } = {}
): void => {
  if (action === 'restore') {
    if (message.moderation?.action === 'blur') delete message.moderation;
    delete message.senderMasked;
    return;
  }
  if (action === 'masked' || options.maskName) {
    message.senderMasked = true;
  }
  if (action === 'masked') return;

  const moderation: MessageModeration = {
    action,
    ...(category ? { category } : {}),
    ...(by ? { by } : {}),
  };

  if (action === 'deleted') {
    tombstoneMessage(message);
  } else if (action === 'hidden') {
    stripContent(message);
  }
  message.moderation = moderation;
};

/** True when the bubble should show the moderation state instead of the content. */
export const isModeratedMessage = (message?: Pick<IMessage, 'moderation'> | null) =>
  message?.moderation?.action === 'blur' || message?.moderation?.action === 'hidden';

/** pii and phi get their own wording on a blurred message. */
export const isPersonalInfoCategory = (category?: string): boolean => {
  const value = String(category || '').toLowerCase();
  return value === 'pii' || value === 'phi';
};

/**
 * The archive rewrite for a suspended sender stamps "Suspended" / "account"
 * as the sender's first and last name.
 */
export const isMaskedSenderName = (
  first?: unknown,
  last?: unknown,
  fullName?: unknown
): boolean =>
  (String(first ?? '').trim().toLowerCase() === 'suspended' &&
    String(last ?? '').trim().toLowerCase() === 'account') ||
  String(fullName ?? '').trim().toLowerCase() === 'suspended account';

/**
 * Messages a `restore` notice should re-read from the archive: those still
 * showing a moderated state that only the original copy can undo.
 */
export const needsArchiveRefresh = (message?: IMessage | null): boolean =>
  Boolean(
    message &&
      (message.moderation?.action === 'hidden' ||
        message.moderation?.action === 'deleted' ||
        (message.moderation && message.isDeleted))
  );

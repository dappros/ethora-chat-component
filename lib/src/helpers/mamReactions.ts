import { Element } from 'ltx';
import { IMessage } from '../types/models/message.model';
import { ReactionAction } from '../types/models/action.model';

/**
 * A reaction restored from the MAM archive whose target message is NOT in the
 * same history page. It is handed back to the caller so it can be dispatched to
 * the store (where a target loaded by an earlier page or a live stanza lives).
 */
export type DeferredReaction = ReactionAction;

/** Normalised view of a single `<reactions xmlns="urn:xmpp:reactions:0">` stanza. */
export interface ExtractedReaction {
  /** Stanza id of the message the reaction targets (matches `IMessage.id`). */
  messageId: string;
  /** Full reactor JID, e.g. `<localpart>@xmpp.host/resource`. */
  from: string;
  /** Bare reactor id (`from` up to `@`); the key reactions are stored under. */
  fromId: string;
  /** Emoji shortcodes for this reactor; empty means the reactor cleared them. */
  emoji: string[];
  /** `<data senderFirstName=… senderLastName=…/>` attributes, if present. */
  data: Record<string, string>;
  /** Room JID derived from `<stanza-id by>` or the reactor JID. */
  roomJID: string;
}

/**
 * Pull the reaction details out of a forwarded MAM message that carries a
 * `<reactions>` child. Returns null when the stanza is not a usable reaction
 * (missing target id or reactor).
 */
export const extractMamReaction = (msg: Element): ExtractedReaction | null => {
  const reactionsEl = msg?.getChild?.('reactions');
  if (!reactionsEl) return null;

  const messageId = reactionsEl.attrs?.id;
  const from = String(reactionsEl.attrs?.from || '');
  const fromId = from.split('@')[0];
  if (!messageId || !fromId) return null;

  const emoji: string[] = reactionsEl
    .getChildren('reaction')
    .map((reaction) => reaction.text())
    .filter(Boolean);
  const data = (msg.getChild('data')?.attrs || {}) as Record<string, string>;

  const stanzaId = msg.getChild('stanza-id');
  const roomJID = String(stanzaId?.attrs?.by || from || '').split('/')[0];

  return { messageId, from, fromId, emoji, data, roomJID };
};

/** Merge a single extracted reaction onto a message object in place. */
const mergeReactionIntoMessage = (
  target: IMessage,
  reaction: ExtractedReaction
): void => {
  if (!target.reaction) target.reaction = {};
  if (reaction.emoji.length === 0) {
    delete target.reaction[reaction.fromId];
  } else {
    target.reaction[reaction.fromId] = {
      emoji: reaction.emoji,
      data: reaction.data,
    };
  }
};

/**
 * Apply MAM reaction stanzas to a freshly parsed history page.
 *
 * Reactions are archived in MAM as standalone `<reactions>` stanzas. The MAM
 * fetch path bypasses the live `onReactionHistory` handler, so without this the
 * reactions only ever existed for the live session and disappeared on refresh.
 *
 * Reactions whose target message is in this same page are merged directly onto
 * the message object (so they are present the instant the page is stored).
 * Reactions whose target is not in the page are returned as `deferred` for the
 * caller to dispatch to the store (the target may live in an earlier page or
 * have arrived live).
 */
export const applyMamReactions = (
  messages: IMessage[],
  reactionStanzas: Element[]
): { messages: IMessage[]; deferred: DeferredReaction[] } => {
  const byId = new Map<string, IMessage>();
  for (const message of messages) {
    if (message?.id) byId.set(String(message.id), message);
  }

  const deferred: DeferredReaction[] = [];
  for (const stanza of reactionStanzas) {
    const reaction = extractMamReaction(stanza);
    if (!reaction) continue;

    const target = byId.get(String(reaction.messageId));
    if (target) {
      mergeReactionIntoMessage(target, reaction);
      continue;
    }
    if (!reaction.roomJID) continue;
    deferred.push({
      roomJID: reaction.roomJID,
      messageId: reaction.messageId,
      reactions: reaction.emoji,
      from: reaction.from,
      data: reaction.data,
    });
  }

  return { messages, deferred };
};

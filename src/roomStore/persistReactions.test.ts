import { describe, expect, it } from 'vitest';
import { parse } from 'ltx';
import {
  compactMessageForPersist,
  dropReactionlessCaches,
  limitMessagesTransform,
} from './index';
import { applyMamReactions } from '../helpers/mamReactions';
import type { IMessage, IRoom } from '../types/types';

const ROOM = '646cc8dc96d4a4dc8f7b2f2d_6a48b84be7b43f307b6f0286@conference.xmpp.chat-qa.ethora.com';

// A reaction stanza exactly as the QA archive returns it (single-quoted
// attributes, mam:tmp + sid:0 ids, <data> with the reactor's names).
const reactionStanza = parse(
  `<message xmlns='jabber:client' type='groupchat' id='message-reaction:1791975114041'>
     <stanza-id by='${ROOM}' id='1791975114136780' xmlns='urn:xmpp:sid:0'/>
     <reactions xmlns='urn:xmpp:reactions:0' id='1791180018286418' from='646cc8dc96d4a4dc8f7b2f2d_647468f20b8c924974e88ade@xmpp.chat-qa.ethora.com/res'><reaction>+1</reaction></reactions>
     <data senderFirstName='Taras' senderLastName='K' senderJid='x@y' senderWalletAddress='0xabc' token='secret'/>
   </message>`
);

const target = (): IMessage =>
  ({ id: '1791180018286418', body: 'hello!', roomJid: ROOM }) as IMessage;

describe('reactions survive a reload of the cached transcript', () => {
  it('keeps reactions, trimmed to what the chip reads', () => {
    const [m] = applyMamReactions([target()], [reactionStanza]).messages;
    const compact = compactMessageForPersist(m);
    expect(compact.reaction).toEqual({
      '646cc8dc96d4a4dc8f7b2f2d_647468f20b8c924974e88ade': {
        emoji: ['+1'],
        data: { senderFirstName: 'Taras', senderLastName: 'K' },
      },
    });
    expect(JSON.stringify(compact)).not.toContain('secret');
  });

  it('omits an empty or malformed reaction map', () => {
    expect(
      'reaction' in
        compactMessageForPersist({ ...target(), reaction: {} } as IMessage)
    ).toBe(false);
    expect(
      'reaction' in
        compactMessageForPersist({
          ...target(),
          reaction: { a: { emoji: [], data: {} } },
        } as IMessage)
    ).toBe(false);
  });

  it('round-trips through the rooms persist transform with its stamp', () => {
    const [m] = applyMamReactions([target()], [reactionStanza]).messages;
    const rooms = { [ROOM]: { jid: ROOM, messages: [m] } as unknown as IRoom };
    const saved = limitMessagesTransform.in(rooms, 'rooms', {} as any) as any;
    expect(saved[ROOM].reactionsCached).toBe(true);
    const restored = limitMessagesTransform.out(saved, 'rooms', {} as any) as any;
    expect(restored[ROOM].messages).toHaveLength(1);
    expect(Object.keys(restored[ROOM].messages[0].reaction)).toHaveLength(1);
  });
});

describe('dropReactionlessCaches', () => {
  const stale = {
    jid: ROOM,
    messages: [{ id: '1' }],
    messageStats: { firstMessageTimestamp: 1, lastMessageTimestamp: 2 },
    historyComplete: true,
    historyPreloadState: 'partial',
  } as unknown as IRoom;

  it('empties a cache saved before reactions were persisted, with its cursors', () => {
    const out = dropReactionlessCaches({ [ROOM]: stale })[ROOM];
    expect(out.messages).toEqual([]);
    expect(out.messageStats).toBeUndefined();
    expect(out.historyComplete).toBe(false);
    expect(out.historyPreloadState).toBe('idle');
    expect(out.jid).toBe(ROOM);
  });

  it('keeps a stamped cache and rooms with nothing cached', () => {
    const stamped = { ...stale, reactionsCached: true } as IRoom;
    const empty = { jid: 'e', messages: [] } as unknown as IRoom;
    const out = dropReactionlessCaches({ [ROOM]: stamped, e: empty });
    expect(out[ROOM]).toBe(stamped);
    expect(out.e).toBe(empty);
  });
});

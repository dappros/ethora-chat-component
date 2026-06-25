import { describe, expect, it } from 'vitest';
import { parse } from 'ltx';
import { applyMamReactions, extractMamReaction } from './mamReactions';
import { IMessage } from '../types/models/message.model';

const ROOM = 'room123@conference.xmpp.chat.ethora.com';
const REACTOR = '6a2c08adef26ca2d3e1e3677';

// A forwarded MAM reaction stanza shaped like the real archive entry: a
// <reactions> child pointing at a target message's stanza id, no <body>.
const reactionStanza = (
  targetId: string,
  emojis: string[],
  reactorId = REACTOR
) =>
  parse(
    `<message id="message-reaction:1782223355148" from="${REACTOR}@xmpp.chat.ethora.com/res">
      <stanza-id xmlns="urn:xmpp:sid:0" by="${ROOM}" id="1782223355148"/>
      <reactions xmlns="urn:xmpp:reactions:0" id="${targetId}" from="${reactorId}@xmpp.chat.ethora.com/res">
        ${emojis.map((e) => `<reaction>${e}</reaction>`).join('')}
      </reactions>
      <data senderFirstName="Roman" senderLastName="L"/>
    </message>`
  );

const message = (id: string): IMessage =>
  ({
    id,
    body: 'hi',
    user: { id: 'u', name: 'U', token: '', refreshToken: '' },
  }) as IMessage;

describe('extractMamReaction', () => {
  it('normalises a reaction stanza', () => {
    const r = extractMamReaction(reactionStanza('1781858659175994', ['👍']));
    expect(r).toMatchObject({
      messageId: '1781858659175994',
      fromId: REACTOR,
      emoji: ['👍'],
      roomJID: ROOM,
    });
    expect(r?.data).toMatchObject({ senderFirstName: 'Roman' });
  });

  it('returns null for a non-reaction message', () => {
    expect(extractMamReaction(parse('<message><body>hi</body></message>'))).toBe(
      null
    );
  });
});

describe('applyMamReactions', () => {
  it('merges a reaction onto its in-page target', () => {
    const target = message('1781858659175994');
    const { messages, deferred } = applyMamReactions(
      [target],
      [reactionStanza('1781858659175994', ['👍', '🔥'])]
    );

    expect(deferred).toHaveLength(0);
    expect(messages[0].reaction?.[REACTOR]).toEqual({
      emoji: ['👍', '🔥'],
      data: expect.objectContaining({ senderFirstName: 'Roman' }),
    });
  });

  it('resolves regardless of stanza order within the page', () => {
    // Reaction processed before its target is encountered in the page array.
    const target = message('111');
    const { messages } = applyMamReactions(
      [target],
      [reactionStanza('111', ['❤️'])]
    );
    expect(messages[0].reaction?.[REACTOR]?.emoji).toEqual(['❤️']);
  });

  it('clears a reactor when the archived reaction is empty', () => {
    const target = message('222');
    target.reaction = { [REACTOR]: { emoji: ['👍'], data: {} } };
    const { messages } = applyMamReactions([target], [reactionStanza('222', [])]);
    expect(messages[0].reaction?.[REACTOR]).toBeUndefined();
  });

  it('keeps multiple reactors on the same message', () => {
    const target = message('333');
    const { messages } = applyMamReactions(
      [target],
      [
        reactionStanza('333', ['👍'], 'aaa'),
        reactionStanza('333', ['🔥'], 'bbb'),
      ]
    );
    expect(messages[0].reaction?.['aaa']?.emoji).toEqual(['👍']);
    expect(messages[0].reaction?.['bbb']?.emoji).toEqual(['🔥']);
  });

  it('defers a reaction whose target is not in the page', () => {
    const { messages, deferred } = applyMamReactions(
      [message('present')],
      [reactionStanza('absent', ['👍'])]
    );
    expect(messages[0].reaction).toBeUndefined();
    expect(deferred).toHaveLength(1);
    expect(deferred[0]).toMatchObject({
      roomJID: ROOM,
      messageId: 'absent',
      reactions: ['👍'],
    });
  });
});

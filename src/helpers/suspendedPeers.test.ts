import { describe, expect, it } from 'vitest';
import { parse, type Element } from 'ltx';
import {
  chunk,
  collectSuspendedLookupTargets,
  getPrivatePeerXmppUsername,
  isPeerSuspendedBounce,
  isPeerSuspendedError,
  PeerSuspendedError,
  peerSuspendedTargetsFromResults,
  selectStalePeerKeys,
  SUSPENDED_STATUS_TTL_MS,
  toPeerKey,
} from './suspendedPeers';
import type { IMessage, IRoom } from '../types/types';

const ME = 'app1_me';
const member = (xmppUsername: string) =>
  ({ _id: xmppUsername, firstName: '', lastName: '', xmppUsername }) as never;

const room = (overrides: Partial<IRoom>): IRoom =>
  ({
    jid: 'r@conference.xmpp.example.com',
    name: 'r',
    title: 'r',
    type: 'group',
    members: [],
    messages: [],
    ...overrides,
  }) as unknown as IRoom;

describe('toPeerKey', () => {
  it.each([
    ['app1_alice', 'app1_alice'],
    ['app1_alice@xmpp.example.com', 'app1_alice'],
    ['app1_alice@xmpp.example.com/web-1', 'app1_alice'],
    ['  app1_alice  ', 'app1_alice'],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(toPeerKey(input)).toBe(expected);
  });

  it('ignores non-strings', () => {
    expect(toPeerKey(undefined)).toBe('');
    expect(toPeerKey(42)).toBe('');
  });
});

describe('getPrivatePeerXmppUsername', () => {
  it('is the member that is not me', () => {
    const r = room({
      type: 'private',
      members: [member(ME), member('app1_bob')],
    });
    expect(getPrivatePeerXmppUsername(r, ME)).toBe('app1_bob');
  });

  it('compares local parts, so a JID-shaped own name still matches', () => {
    const r = room({
      type: 'private',
      members: [
        member(`${ME}@xmpp.example.com`),
        member('app1_bob@xmpp.example.com'),
      ],
    });
    expect(getPrivatePeerXmppUsername(r, ME)).toBe('app1_bob');
  });

  it('is empty for group rooms and for unknown members', () => {
    expect(
      getPrivatePeerXmppUsername(
        room({ members: [member(ME), member('app1_bob')] }),
        ME
      )
    ).toBe('');
    expect(
      getPrivatePeerXmppUsername(room({ type: 'private', members: [] }), ME)
    ).toBe('');
    expect(
      getPrivatePeerXmppUsername(
        room({ type: 'private', members: [member(ME)] }),
        ME
      )
    ).toBe('');
    expect(getPrivatePeerXmppUsername(undefined, ME)).toBe('');
  });
});

describe('collectSuspendedLookupTargets', () => {
  const msg = (id: string, extra: Partial<IMessage> = {}): IMessage =>
    ({
      id: `m-${id}-${Math.random()}`,
      body: 'hi',
      user: { id },
      ...extra,
    }) as IMessage;

  it('takes private partners from every room and members + senders of the open room only', () => {
    const rooms: Record<string, IRoom> = {
      'dm1@conference.x': room({
        type: 'private',
        members: [member(ME), member('app1_bob')],
      }),
      'dm2@conference.x': room({
        type: 'private',
        members: [member('app1_carol'), member(ME)],
      }),
      'grp@conference.x': room({
        members: [member('app1_dave'), member(ME)],
        messages: [
          msg('app1_erin@xmpp.example.com'),
          msg(ME),
          msg('app1_frank', { isSystemMessage: 'true' }),
          msg('app1_gina', { senderMasked: true }),
        ],
      }),
      'other@conference.x': room({
        members: [member('app1_henry')],
        messages: [msg('app1_ivy')],
      }),
    };
    const targets = collectSuspendedLookupTargets(
      rooms,
      'grp@conference.x',
      ME
    );
    expect(targets.sort()).toEqual([
      'app1_bob',
      'app1_carol',
      'app1_dave',
      'app1_erin',
    ]);
  });

  it('dedupes and copes with no open room', () => {
    const rooms: Record<string, IRoom> = {
      a: room({ type: 'private', members: [member(ME), member('app1_bob')] }),
      b: room({ type: 'private', members: [member(ME), member('app1_bob')] }),
    };
    expect(collectSuspendedLookupTargets(rooms, null, ME)).toEqual([
      'app1_bob',
    ]);
    expect(collectSuspendedLookupTargets(undefined, null, ME)).toEqual([]);
  });
});

describe('selectStalePeerKeys', () => {
  const now = 10_000_000;
  it('keeps unknown names and answers older than the TTL', () => {
    const statuses = {
      fresh: { suspended: true, checkedAt: now - 1000 },
      old: { suspended: false, checkedAt: now - SUSPENDED_STATUS_TTL_MS },
    };
    expect(selectStalePeerKeys(['fresh', 'old', 'new'], statuses, now)).toEqual(
      ['old', 'new']
    );
  });
});

describe('chunk', () => {
  it('splits into batches of at most `size`', () => {
    const items = Array.from({ length: 1201 }, (_, i) => i);
    const batches = chunk(items, 500);
    expect(batches.map((b) => b.length)).toEqual([500, 500, 201]);
    expect(chunk([], 500)).toEqual([]);
  });
});

describe('isPeerSuspendedBounce', () => {
  const bounce = `<message type='error' from='app1_bob@xmpp.example.com' id='msg-1'>
    <error type='cancel'>
      <not-acceptable xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/>
      <text xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'>Recipient account is suspended</text>
      <suspended xmlns='urn:ethora:moderation'/>
    </error>
  </message>`;

  it('recognises the chat server bounce', () => {
    expect(isPeerSuspendedBounce(parse(bounce) as Element)).toBe(true);
  });

  it('needs the suspended child in the moderation namespace', () => {
    const plain = `<message type='error' from='a@x' id='1'><error type='cancel'>
      <not-acceptable xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/>
      <text xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'>Recipient account is suspended</text>
    </error></message>`;
    const otherNs = `<message type='error' from='a@x' id='1'><error type='cancel'>
      <suspended xmlns='urn:example:other'/></error></message>`;
    expect(isPeerSuspendedBounce(parse(plain) as Element)).toBe(false);
    expect(isPeerSuspendedBounce(parse(otherNs) as Element)).toBe(false);
  });

  it('ignores anything that is not an error message', () => {
    const chat = `<message type='chat' from='a@x' id='1'><error>
      <suspended xmlns='urn:ethora:moderation'/></error></message>`;
    const presence = `<presence type='error' from='a@x'><error>
      <suspended xmlns='urn:ethora:moderation'/></error></presence>`;
    expect(isPeerSuspendedBounce(parse(chat) as Element)).toBe(false);
    expect(isPeerSuspendedBounce(parse(presence) as Element)).toBe(false);
    expect(isPeerSuspendedBounce(undefined)).toBe(false);
  });
});

describe('PEER_SUSPENDED results', () => {
  it('reads the skipped accounts out of a bulk add', () => {
    expect(
      peerSuspendedTargetsFromResults([
        { xmppUsername: 'app1_bob', code: 'PEER_SUSPENDED' },
        {
          username: 'app1_carol@xmpp.example.com',
          error: { code: 'PEER_SUSPENDED' },
        },
        { xmppUsername: 'app1_dave', firstName: 'Dave' },
        null,
      ])
    ).toEqual(['app1_bob', 'app1_carol']);
    expect(peerSuspendedTargetsFromResults({})).toEqual([]);
  });

  it('PeerSuspendedError carries the code', () => {
    const error = new PeerSuspendedError();
    expect(isPeerSuspendedError(error)).toBe(true);
    expect(isPeerSuspendedError(new Error('x'))).toBe(false);
    expect(isPeerSuspendedError(null)).toBe(false);
  });
});

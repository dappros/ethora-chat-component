import { describe, expect, it } from 'vitest';
import { parse, type Element } from 'ltx';
import {
  applyModeration,
  isMaskedSenderName,
  isModerationNotice,
  isPersonalInfoCategory,
  noticeTargets,
  normalizeModerationAction,
  parseModerationMarker,
  parseModerationNotice,
} from './moderation';
import { getDataFromXml } from './getDataFromXml';
import { createMessageFromXml } from './createMessageFromXml';
import type { IMessage } from '../types/types';

const ROOM = 'room1@conference.xmpp.example';
const NS = 'urn:ethora:moderation';

const xml = (source: string) => parse(source) as Element;

const archived = (moderation: string, body = 'you are awful') =>
  xml(`<message xmlns="jabber:client" from="${ROOM}/alice" id="client-1" type="groupchat">
    <body>${body}</body>
    <stanza-id xmlns="urn:xmpp:sid:0" id="1730000000000001" by="${ROOM}"/>
    <data senderFirstName="Alice" senderLastName="Smith" senderJID="alice@xmpp.example"/>
    ${moderation}
  </message>`);

const message = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: '1730000000000001',
    xmppId: 'client-1',
    body: 'hello',
    date: '2026-11-01T00:00:00.000Z',
    roomJid: ROOM,
    user: { id: 'alice' },
    ...overrides,
  }) as IMessage;

describe('normalizeModerationAction', () => {
  it.each([
    ['blur', 'blur'],
    ['hide', 'hidden'],
    ['hidden', 'hidden'],
    ['delete', 'deleted'],
    ['deleted', 'deleted'],
    ['restore', 'restore'],
    ['restored', 'restore'],
    ['masked', 'masked'],
    ['nonsense', null],
    [undefined, null],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeModerationAction(raw)).toBe(expected);
  });
});

describe('parseModerationMarker (archived messages)', () => {
  it('reads action, category and by', () => {
    const stanza = archived(
      `<moderation xmlns="${NS}" action="blur" category="toxicity" by="auto"/>`
    );
    expect(parseModerationMarker(stanza)).toEqual({
      action: 'blur',
      category: 'toxicity',
      by: 'auto',
    });
  });

  it('ignores an element in another namespace', () => {
    const stanza = archived(`<moderation xmlns="urn:other" action="blur"/>`);
    expect(parseModerationMarker(stanza)).toBeUndefined();
  });

  it('is undefined for a live notice (it names a target)', () => {
    const notice = xml(
      `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="hidden" stanza-id="1"/></message>`
    );
    expect(parseModerationMarker(notice)).toBeUndefined();
  });

  it('is undefined for an unknown action', () => {
    expect(
      parseModerationMarker(archived(`<moderation xmlns="${NS}" action="weird"/>`))
    ).toBeUndefined();
  });
});

describe('parseModerationNotice (live notices)', () => {
  it('parses a message-level notice', () => {
    const stanza = xml(
      `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="hidden" category="severe" stanza-id="1730000000000001" origin-id="client-1"/></message>`
    );
    expect(isModerationNotice(stanza)).toBe(true);
    expect(parseModerationNotice(stanza)).toEqual({
      roomJID: ROOM,
      action: 'hidden',
      category: 'severe',
      stanzaId: '1730000000000001',
      originId: 'client-1',
    });
  });

  it('parses a user-level notice', () => {
    const stanza = xml(
      `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="hide" category="suspension" user="alice"/></message>`
    );
    expect(parseModerationNotice(stanza)).toEqual({
      roomJID: ROOM,
      action: 'hidden',
      category: 'suspension',
      user: 'alice',
    });
  });

  it('reads mask-name and the masked / restored actions', () => {
    const hidden = xml(
      `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="hidden" category="suspension" user="alice" mask-name="true"/></message>`
    );
    expect(parseModerationNotice(hidden)).toMatchObject({ action: 'hidden', maskName: true });
    const masked = xml(
      `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="masked" user="alice"/></message>`
    );
    expect(parseModerationNotice(masked)).toMatchObject({ action: 'masked', user: 'alice' });
    const restored = xml(
      `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="restored" stanza-id="1"/></message>`
    );
    expect(parseModerationNotice(restored)).toMatchObject({ action: 'restore', stanzaId: '1' });
  });

  it('is not a notice when the stanza has text (an archived message)', () => {
    const stanza = archived(
      `<moderation xmlns="${NS}" action="blur" stanza-id="1730000000000001"/>`
    );
    expect(parseModerationNotice(stanza)).toBeNull();
  });

  it('is not a notice without a target', () => {
    const stanza = xml(
      `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="hidden"/></message>`
    );
    expect(parseModerationNotice(stanza)).toBeNull();
  });
});

describe('noticeTargets', () => {
  it('matches the archive id', () => {
    expect(noticeTargets(message(), { stanzaId: '1730000000000001' })).toBe(true);
  });

  it('matches the client id on an own echoed message', () => {
    expect(
      noticeTargets(message({ id: 'send-text-message:x', xmppId: 'client-1' }), {
        originId: 'client-1',
      })
    ).toBe(true);
  });

  it('does not match another message', () => {
    expect(noticeTargets(message({ id: '2', xmppId: '3' }), { stanzaId: '1' })).toBe(false);
  });

  it('matches every message of a sender when only `user` is given', () => {
    expect(noticeTargets(message({ user: { id: 'Alice' } as never }), { user: 'alice' })).toBe(
      true
    );
    expect(noticeTargets(message({ user: { id: 'bob' } as never }), { user: 'alice' })).toBe(
      false
    );
  });

  it('ignores the unread separator', () => {
    expect(noticeTargets(message({ id: 'delimiter-new' }), { user: 'alice' })).toBe(false);
  });
});

describe('applyModeration', () => {
  it('blur keeps the content', () => {
    const target = message();
    applyModeration(target, 'blur', 'toxicity', 'auto');
    expect(target.body).toBe('hello');
    expect(target.moderation).toEqual({ action: 'blur', category: 'toxicity', by: 'auto' });
  });

  it('hidden drops the content', () => {
    const target = message({
      isMediafile: 'true',
      location: 'https://files.example/a.png',
      caption: 'look',
    });
    applyModeration(target, 'hidden', 'severe');
    expect(target.body).toBe('');
    expect(target.location).toBeUndefined();
    expect(target.caption).toBeUndefined();
    expect(target.isMediafile).toBe('false');
    expect(target.moderation?.action).toBe('hidden');
  });

  it('deleted is the existing tombstone', () => {
    const target = message();
    applyModeration(target, 'deleted', 'severe');
    expect(target.isDeleted).toBe(true);
    expect(target.body).toBe('');
  });

  it('masked keeps the content and masks the name', () => {
    const target = message();
    applyModeration(target, 'masked');
    expect(target.senderMasked).toBe(true);
    expect(target.body).toBe('hello');
    expect(target.moderation).toBeUndefined();
  });

  it('maskName masks the name along with hiding', () => {
    const target = message();
    applyModeration(target, 'hidden', 'suspension', undefined, { maskName: true });
    expect(target.senderMasked).toBe(true);
    expect(target.moderation?.action).toBe('hidden');
  });

  it('restore unmasks the name', () => {
    const target = message({ senderMasked: true });
    applyModeration(target, 'restore');
    expect(target.senderMasked).toBeUndefined();
  });

  it('restore lifts a blur but cannot bring back hidden content', () => {
    const blurred = message({ moderation: { action: 'blur' } });
    applyModeration(blurred, 'restore');
    expect(blurred.moderation).toBeUndefined();

    const hidden = message();
    applyModeration(hidden, 'hidden');
    applyModeration(hidden, 'restore');
    expect(hidden.moderation?.action).toBe('hidden');
  });
});

describe('category helpers', () => {
  it('pii and phi are personal information', () => {
    expect(isPersonalInfoCategory('pii')).toBe(true);
    expect(isPersonalInfoCategory('PHI')).toBe(true);
    expect(isPersonalInfoCategory('toxicity')).toBe(false);
  });

  it('detects the masked sender name', () => {
    expect(isMaskedSenderName('Suspended', 'account')).toBe(true);
    expect(isMaskedSenderName(' suspended ', 'Account')).toBe(true);
    expect(isMaskedSenderName('Suspended', 'Smith')).toBe(false);
    expect(isMaskedSenderName(undefined, undefined)).toBe(false);
    expect(isMaskedSenderName(undefined, undefined, 'Suspended account')).toBe(true);
  });
});

describe('stanza -> message model', () => {
  const toMessage = async (stanza: Element) =>
    createMessageFromXml((await getDataFromXml(stanza)) as never);

  it('a blurred archive message keeps its text and carries the state', async () => {
    const parsed = await toMessage(
      archived(`<moderation xmlns="${NS}" action="blur" category="pii" by="auto"/>`)
    );
    expect(parsed.body).toBe('you are awful');
    expect(parsed.moderation).toEqual({ action: 'blur', category: 'pii', by: 'auto' });
  });

  it('a hidden archive message carries no content', async () => {
    const parsed = await toMessage(
      archived(`<moderation xmlns="${NS}" action="hidden" category="severe"/>`, '')
    );
    expect(parsed.body).toBe('');
    expect(parsed.moderation?.action).toBe('hidden');
    expect(parsed.isDeleted).toBe(false);
  });

  it('a deleted archive message renders as deleted', async () => {
    const parsed = await toMessage(
      archived(`<moderation xmlns="${NS}" action="deleted" category="suspension"/><deleted/>`, 'deleted')
    );
    expect(parsed.isDeleted).toBe(true);
  });

  it('flags a sender masked through fullName only', async () => {
    const stanza = xml(`<message from="${ROOM}/alice" id="c4" type="groupchat">
      <body>hi</body>
      <data fullName="Suspended account" photo=""/>
    </message>`);
    expect((await toMessage(stanza)).senderMasked).toBe(true);
  });

  it('flags a masked sender', async () => {
    const stanza = xml(`<message from="${ROOM}/alice" id="c2" type="groupchat">
      <body>hi</body>
      <data senderFirstName="Suspended" senderLastName="account" photoURL=""/>
    </message>`);
    const parsed = await toMessage(stanza);
    expect(parsed.senderMasked).toBe(true);
  });

  it('carries the sensitive flag from <data>', async () => {
    const stanza = xml(`<message from="${ROOM}/alice" id="c3" type="groupchat">
      <body>media</body>
      <data isMediafile="true" isSensitive="true" sensitiveCategory="nudity" location="https://secure-files.example/b/a.png"/>
    </message>`);
    const parsed = await toMessage(stanza);
    expect(parsed.isSensitive).toBe('true');
    expect(parsed.sensitiveCategory).toBe('nudity');
    expect(parsed.moderation).toBeUndefined();
  });
});

/**
 * Round-trip for the call-key exchange: the LiveKit media key travels over the
 * same OMEMO channel as chat, as an ephemeral signal, so the server only ever
 * sees ciphertext. This exercises Omemo.sendGroupSignal + the <call-key>
 * element helpers against the in-memory PEP stand-in (no ejabberd needed),
 * mirroring omemo.muc.test.ts.
 */
import { xml } from '@xmpp/client';
import { Element, parse } from 'ltx';
import { describe, expect, it } from 'vitest';
import { Omemo } from './omemo';
import { createMemoryStore } from './store';
import { callKeyElement, generateCallKey, parseCallKey } from './callKey';

const DOMAIN = 'localhost';
const ROOM = 'room1@conference.localhost';
const ALICE = `alice@${DOMAIN}`;
const BOB = `bob@${DOMAIN}`;

/** PEP items of every account, shared by the fake clients: jid -> node -> id. */
type Pep = Map<string, Map<string, Map<string, Element>>>;

function fakeClient(pep: Pep, jid: string) {
  const sent: Element[] = [];
  const nodesOf = (owner: string) => {
    let nodes = pep.get(owner);
    if (!nodes) pep.set(owner, (nodes = new Map()));
    return nodes;
  };
  return {
    sent,
    jid: {
      bare: () => ({ toString: () => jid }),
      getDomain: () => jid.split('@')[1],
      getLocal: () => jid.split('@')[0],
      toString: () => jid,
    },
    send: async (stanza: Element) => void sent.push(stanza),
    iqCaller: {
      request: async (iq: Element) => {
        const pubsub = iq.getChild('pubsub')!;
        const publish = pubsub.getChild('publish');
        if (publish) {
          const node = nodesOf(jid);
          const item = publish.getChild('item')!;
          let items = node.get(publish.attrs.node);
          if (!items) node.set(publish.attrs.node, (items = new Map()));
          items.set(item.attrs.id, item.children[0] as Element);
          return xml('iq', { type: 'result' });
        }
        const query = pubsub.getChild('items')!;
        const owner = String(iq.attrs.to);
        const stored = nodesOf(owner).get(query.attrs.node) ?? new Map();
        const wanted = query.getChild('item')?.attrs.id;
        const items = [...stored.entries()]
          .filter(([id]) => !wanted || id === wanted)
          .map(([id, payload]) => xml('item', { id }, payload));
        return xml(
          'iq',
          { type: 'result' },
          xml(
            'pubsub',
            { xmlns: 'http://jabber.org/protocol/pubsub' },
            xml('items', { node: query.attrs.node }, ...items)
          )
        );
      },
    },
  };
}

describe('generateCallKey', () => {
  it('is a fresh 256-bit base64 key each time', () => {
    const a = generateCallKey();
    const b = generateCallKey();
    expect(a).not.toBe(b);
    // 32 bytes -> 44 base64 chars (with padding)
    expect(a).toHaveLength(44);
  });
});

describe('call key over OMEMO', () => {
  it('reaches the peer encrypted and never appears on the wire', async () => {
    const pep: Pep = new Map();
    const aliceClient = fakeClient(pep, ALICE);
    const alice = await Omemo.create(aliceClient as never, ALICE, createMemoryStore());
    const bob = await Omemo.create(
      fakeClient(pep, BOB) as never,
      BOB,
      createMemoryStore()
    );

    const key = generateCallKey();
    const ok = await alice.sendGroupSignal(
      ROOM,
      [ALICE, BOB],
      [callKeyElement('call-1', key)],
      'sig-1'
    );
    expect(ok).toBe(true);

    const stanza = aliceClient.sent.at(-1)!;
    expect(stanza.attrs.type).toBe('groupchat');
    expect(stanza.attrs.to).toBe(ROOM);

    // The key is inside the encrypted payload, so it must not be readable on
    // the wire - that is the whole point of carrying it over OMEMO.
    const wire = stanza.toString();
    expect(wire).not.toContain(key);
    // Ephemeral signal, not a chat message: no fallback body, kept out of MAM.
    expect(stanza.getChild('body')).toBeUndefined();
    expect(stanza.getChild('no-store', 'urn:xmpp:hints')).toBeDefined();

    // Bob decrypts it and recovers the exact key.
    const decrypted = await bob.decrypt(stanza, ALICE, ROOM);
    expect(decrypted?.error).toBeUndefined();
    expect(decrypted?.content).toContain(key);
    expect(decrypted?.content).toContain('ethora:call:e2ee:0');
  });

  it('returns false when no member has an OMEMO device', async () => {
    const pep: Pep = new Map();
    const alice = await Omemo.create(
      fakeClient(pep, ALICE) as never,
      ALICE,
      createMemoryStore()
    );
    // Bob never created a device, so there is nobody to encrypt to. A call
    // falls back to plaintext media rather than throwing.
    const ok = await alice.sendGroupSignal(
      ROOM,
      [ALICE, BOB],
      [callKeyElement('call-2', generateCallKey())],
      'sig-2'
    );
    expect(ok).toBe(false);
  });
});

describe('parseCallKey', () => {
  it('reads a decrypted <call-key> off the rewritten stanza', () => {
    // Shape the OMEMO seam leaves behind: the envelope content re-parsed and
    // appended as ordinary children of the message.
    const stanza = parse(
      `<message from="${ROOM}/alice"><call-key xmlns="ethora:call:e2ee:0" callId="c9" key="AAABBBCCC"/></message>`
    );
    expect(parseCallKey(stanza)).toEqual({ callId: 'c9', key: 'AAABBBCCC' });
  });

  it('ignores a plain message', () => {
    const stanza = xml('message', {}, xml('body', {}, 'hi'));
    expect(parseCallKey(stanza)).toBeUndefined();
  });

  it('ignores a call-key with no key', () => {
    const stanza = parse(
      `<message><call-key xmlns="ethora:call:e2ee:0" callId="c9"/></message>`
    );
    expect(parseCallKey(stanza)).toBeUndefined();
  });
});

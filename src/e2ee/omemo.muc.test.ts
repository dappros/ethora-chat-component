/**
 * Round-trip test for the MUC adaptation of OMEMO 2.
 *
 * The crypto itself came over from `xmpp-o` unchanged; what is new here is
 * everything that had to change because messages go to a room rather than to
 * a person: one <keys jid> block per member, an envelope addressed to the
 * room, and a sender identity derived from the room nick. Those are what this
 * file exercises, against an in-memory stand-in for the server's PEP storage
 * so no ejabberd is needed.
 */
import { xml } from '@xmpp/client';
import { Element } from 'ltx';
import { describe, expect, it } from 'vitest';
import { Omemo } from './omemo';
import { createMemoryStore } from './store';
import { senderJidFromMuc } from './index';
import { decryptStanzaInPlace, encryptedCarrier } from './stanza';

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
          // A PEP publish always lands on the publisher's own account
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

/** The two children a text message carries: the body and Ethora's metadata. */
const content = (text: string) => [
  xml('data', { xmlns: 'ethora', senderFirstName: 'Alice', fullName: 'Alice A' }),
  xml('body', {}, text),
];

async function twoMembers() {
  const pep: Pep = new Map();
  const alice = await Omemo.create(
    fakeClient(pep, ALICE) as never,
    ALICE,
    createMemoryStore()
  );
  const bob = await Omemo.create(
    fakeClient(pep, BOB) as never,
    BOB,
    createMemoryStore()
  );
  return { alice, bob };
}

describe('OMEMO 2 in a MUC room', () => {
  it('encrypts to every member and decrypts back to the original children', async () => {
    const { alice, bob } = await twoMembers();

    const stanza = await alice.encryptGroupMessage(
      ROOM,
      [ALICE, BOB],
      content('hello room'),
      'msg-1'
    );

    expect(stanza.attrs.type).toBe('groupchat');
    expect(stanza.attrs.to).toBe(ROOM);
    // The id has to survive, or the sender's optimistic bubble never matches
    // the echo the room sends back
    expect(stanza.attrs.id).toBe('msg-1');

    const decrypted = await bob.decrypt(stanza, ALICE, ROOM);
    expect(decrypted?.error).toBeUndefined();
    expect(decrypted?.content).toContain('hello room');
    // The metadata element travels inside the envelope, not beside it
    expect(decrypted?.content).toContain('senderFirstName="Alice"');
  });

  it('puts nothing readable in the stanza itself', async () => {
    const { alice } = await twoMembers();
    const stanza = await alice.encryptGroupMessage(
      ROOM,
      [ALICE, BOB],
      content('top secret'),
      'msg-2'
    );

    const wire = stanza.toString();
    expect(wire).not.toContain('top secret');
    // ...including the metadata that used to sit in a plain <data> element
    expect(wire).not.toContain('senderFirstName');
    expect(wire).not.toContain('Alice');
  });

  it('addresses one <keys> block per member', async () => {
    const { alice } = await twoMembers();
    const stanza = await alice.encryptGroupMessage(
      ROOM,
      [ALICE, BOB],
      content('hi'),
      'msg-3'
    );

    const blocks = stanza
      .getChild('encrypted')!
      .getChild('header')!
      .getChildren('keys');
    // Alice's own devices get a block too, but this device is excluded from
    // it, so with a single device of her own only Bob's block carries keys
    expect(blocks.map((b) => b.attrs.jid)).toEqual([BOB]);
  });

  it('throws when no member has a published device', async () => {
    const pep: Pep = new Map();
    const alice = await Omemo.create(
      fakeClient(pep, ALICE) as never,
      ALICE,
      createMemoryStore()
    );

    // Encrypting to nobody is not a thing: this must throw rather than build
    // a keyless stanza. What the caller does with that is its own decision -
    // sendTextMessage catches it and sends the message in clear.
    await expect(
      alice.encryptGroupMessage(ROOM, [ALICE, BOB], content('hi'), 'msg-4')
    ).rejects.toThrow('omemo_no_recipients');
  });

  it('rejects a message replayed into a different room', async () => {
    const { alice, bob } = await twoMembers();
    const stanza = await alice.encryptGroupMessage(
      ROOM,
      [ALICE, BOB],
      content('hi'),
      'msg-5'
    );

    // The envelope names the room it was written for, so re-posting the same
    // ciphertext elsewhere does not decrypt
    const decrypted = await bob.decrypt(stanza, ALICE, 'other@conference.localhost');
    expect(decrypted?.error).toBe('omemo_decrypt_failed');
    expect(decrypted?.content).toBeUndefined();
  });

  it('rejects a message replayed under someone else\'s nick', async () => {
    const { alice, bob } = await twoMembers();
    const stanza = await alice.encryptGroupMessage(
      ROOM,
      [ALICE, BOB],
      content('hi'),
      'msg-6'
    );

    // Claiming to be a different member must not work: the envelope's `from`
    // is checked against the JID the room nick resolves to
    const decrypted = await bob.decrypt(stanza, `mallory@${DOMAIN}`, ROOM);
    expect(decrypted?.content).toBeUndefined();
  });

  it('returns the cached plaintext for the room\'s echo of our own message', async () => {
    const { alice } = await twoMembers();
    const stanza = await alice.encryptGroupMessage(
      ROOM,
      [ALICE, BOB],
      content('my own words'),
      'msg-7'
    );

    // A MUC reflects the message back to its sender, but we deliberately do
    // not encrypt to this device - the echo is resolved from the local cache
    const echo = await alice.decrypt(stanza, ALICE, ROOM);
    expect(echo?.trust).toBe('own');
    expect(echo?.content).toContain('my own words');
  });

  it('decrypts the same archived message twice', async () => {
    const { alice, bob } = await twoMembers();
    const stanza = await alice.encryptGroupMessage(
      ROOM,
      [ALICE, BOB],
      content('from history'),
      'msg-8'
    );

    const live = await bob.decrypt(stanza, ALICE, ROOM);
    // Message keys are single-use, so a second delivery (MAM, mucsub replay)
    // can only work off the cache
    const replay = await bob.decrypt(stanza, ALICE, ROOM);
    expect(live?.content).toContain('from history');
    expect(replay?.content).toBe(live?.content);
  });

  it('ignores stanzas without an OMEMO payload', async () => {
    const { bob } = await twoMembers();
    expect(bob.decrypt(xml('message', { id: 'x' }), ALICE, ROOM)).toBeUndefined();
  });
});

describe('senderJidFromMuc', () => {
  it('resolves the room nick to the account it belongs to', () => {
    // The SDK joins with client.jid.getLocal() as the nick, so the nick is
    // the account's localpart - which is why OMEMO works here without making
    // the room non-anonymous
    expect(senderJidFromMuc(`${ROOM}/alice`, DOMAIN)).toBe(ALICE);
  });

  it('has no answer for a bare room JID', () => {
    expect(senderJidFromMuc(ROOM, DOMAIN)).toBeUndefined();
    expect(senderJidFromMuc(undefined, DOMAIN)).toBeUndefined();
  });
});

describe('encryptedCarrier', () => {
  const encrypted = () =>
    xml('encrypted', { xmlns: 'urn:xmpp:omemo:2' }, xml('payload', {}, 'x'));

  it('finds the message inside a MAM result', () => {
    // This is the shape archive pages arrive in; missing it is what made
    // history render the sender's fallback body instead of the real text
    const stanza = xml(
      'message',
      {},
      xml(
        'result',
        { xmlns: 'urn:xmpp:mam:2' },
        xml(
          'forwarded',
          { xmlns: 'urn:xmpp:forward:0' },
          xml('message', { id: 'inner' }, encrypted())
        )
      )
    );
    expect(encryptedCarrier(stanza)?.attrs.id).toBe('inner');
  });

  it('finds the message inside a mucsub event', () => {
    const stanza = xml(
      'message',
      {},
      xml(
        'event',
        { xmlns: 'http://jabber.org/protocol/pubsub#event' },
        xml('items', {}, xml('item', {}, xml('message', { id: 'sub' }, encrypted())))
      )
    );
    expect(encryptedCarrier(stanza)?.attrs.id).toBe('sub');
  });

  it('returns the stanza itself when it carries the payload', () => {
    const stanza = xml('message', { id: 'live' }, encrypted());
    expect(encryptedCarrier(stanza)?.attrs.id).toBe('live');
  });

  it('ignores a plain message', () => {
    expect(
      encryptedCarrier(xml('message', { id: 'p' }, xml('body', {}, 'hi')))
    ).toBeUndefined();
  });
});

describe('PEP node repair', () => {
  /**
   * A server whose bundles node already exists with a configuration that our
   * publish-options cannot satisfy. That is what a change to `max_items_node`
   * (or a forced node config) does to every account that already published -
   * and without recovery it locks them out of encryption permanently.
   */
  function pickyClient(pep: Pep, jid: string, failures: { count: number }) {
    const base = fakeClient(pep, jid);
    return {
      ...base,
      iqCaller: {
        request: async (iq: Element) => {
          const owner = iq.getChild(
            'pubsub',
            'http://jabber.org/protocol/pubsub#owner'
          );
          if (owner?.getChild('configure')) {
            // Reconfiguring the node is what makes the publish work again
            failures.count = 0;
            return xml('iq', { type: 'result' });
          }
          const publish = iq.getChild('pubsub')?.getChild('publish');
          if (publish?.attrs.node === 'urn:xmpp:omemo:2:bundles' && failures.count > 0) {
            failures.count--;
            throw Object.assign(new Error('precondition-not-met'), {
              condition: 'precondition-not-met',
            });
          }
          return base.iqCaller.request(iq);
        },
      },
    };
  }

  it('reconfigures a node that rejects our publish-options', async () => {
    const pep: Pep = new Map();
    const omemo = await Omemo.create(
      pickyClient(pep, ALICE, { count: 1 }) as never,
      ALICE,
      createMemoryStore()
    );
    // Recovery happened inside create(); the bundle is published either way
    const bundles = pep.get(ALICE)?.get('urn:xmpp:omemo:2:bundles');
    expect(bundles?.has(String(omemo.deviceId))).toBe(true);
  });

  it('gives up on an error it cannot repair', async () => {
    const pep: Pep = new Map();
    const broken = {
      ...fakeClient(pep, ALICE),
      iqCaller: {
        request: async () => {
          throw Object.assign(new Error('forbidden'), { condition: 'forbidden' });
        },
      },
    };
    await expect(
      Omemo.create(broken as never, ALICE, createMemoryStore())
    ).rejects.toThrow('forbidden');
  });
});

describe('decryptStanzaInPlace', () => {
  const stanzaWithPayload = () =>
    xml(
      'message',
      { from: `${ROOM}/alice`, id: 'm1' },
      xml(
        'encrypted',
        { xmlns: 'urn:xmpp:omemo:2' },
        xml('header', { sid: '1' }),
        xml('payload', {}, 'ignored')
      ),
      xml('body', {}, 'fallback for clients without OMEMO')
    );

  it('marks a message it could not read as encrypted, not as sent in clear', async () => {
    // With no keys on this device the message cannot be opened - but it still
    // arrived inside an OMEMO payload. Labelling it "not encrypted" would
    // claim the sender transmitted it in the open, which is the opposite of
    // what happened.
    const stanza = stanzaWithPayload();
    const outcome = await decryptStanzaInPlace(stanza, DOMAIN);

    expect(outcome).toBe('undecryptable');
    expect(stanza.getChild('data')?.attrs.omemoEncrypted).toBe('true');
    // The sender's fallback body never survives: it explains the wrong reason
    expect(stanza.getChildText('body')).not.toContain('fallback for clients');
  });

  it('drops a session-maintenance message', async () => {
    const stanza = xml(
      'message',
      { from: `${ROOM}/alice` },
      xml('encrypted', { xmlns: 'urn:xmpp:omemo:2' }, xml('header', { sid: '1' }))
    );
    expect(await decryptStanzaInPlace(stanza, DOMAIN)).toBe('drop');
  });

  it('leaves a plain message alone', async () => {
    const stanza = xml('message', { from: `${ROOM}/alice` }, xml('body', {}, 'hi'));
    expect(await decryptStanzaInPlace(stanza, DOMAIN)).toBe('not-encrypted');
    expect(stanza.getChildText('body')).toBe('hi');
    expect(stanza.getChild('data')).toBeUndefined();
  });
});

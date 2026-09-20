// OMEMO 2 (XEP-0384 v0.8, `urn:xmpp:omemo:2`) for this SDK's MUC rooms.
//
// Ported from the one-to-one implementation in the `xmpp-o` project. The
// crypto (crypto/protobuf/ratchet/store) is unchanged; what differs is that
// every chat here - including a two-person "private" one - is a MUC room:
//
//  - a message is encrypted for the devices of EVERY member, so the header
//    carries one <keys jid="..."> block per member instead of one peer plus
//    ourselves;
//  - the author of an incoming stanza is a room nick, not a real JID. This
//    SDK joins with `client.jid.getLocal()` as the nick (see
//    presenceInRoom.xmpp.ts), so the real bare JID is `<nick>@<domain>` and
//    the room does NOT have to be made non-anonymous for OMEMO to work;
//  - the SCE envelope wraps the whole content element set (<body> AND the
//    custom <data> element carrying sender name, avatar and mentions), not
//    just the body - otherwise encrypting the text would hide nothing;
//  - session-completing empty messages cannot go through the room, since
//    they target one device. They are sent as a direct type='chat' stanza to
//    that member's real JID instead.

import { xml, type Client } from '@xmpp/client';
import { Element, parse } from 'ltx';
import {
  bytesEqual,
  fromBase64,
  generateIdentity,
  generateKeyPair,
  randomBytes,
  randomInt,
  sign,
  toBase64,
  toHex,
  type IdentityKey,
  type KeyPair,
} from './crypto';
import { decodeKeyExchange, encodeKeyExchange } from './protobuf';
import {
  acceptSession,
  decryptPayload,
  encryptPayload,
  initiateSession,
  ratchetDecrypt,
  ratchetEncrypt,
  type Bundle,
  type Session,
} from './ratchet';
import type { OmemoStore } from './store';

export const NS_OMEMO = 'urn:xmpp:omemo:2';
const NODE_DEVICES = 'urn:xmpp:omemo:2:devices';
const NODE_BUNDLES = 'urn:xmpp:omemo:2:bundles';
const NS_PUBSUB = 'http://jabber.org/protocol/pubsub';
const NS_PUBSUB_OWNER = 'http://jabber.org/protocol/pubsub#owner';
const NS_SCE = 'urn:xmpp:sce:1';
const PREKEY_COUNT = 100;
const DEVICE_LIST_TTL = 30_000;

/** Shown by clients that cannot read `urn:xmpp:omemo:2`. */
export const FALLBACK_BODY =
  'This message is end-to-end encrypted (OMEMO 2) and your client cannot read it.';

/** Blind Trust Before Verification: new devices are trusted until one is verified. */
export type Trust = 'blind' | 'verified' | 'untrusted';

interface OwnKeys {
  deviceId: number;
  identity: IdentityKey;
  spk: { id: number; pair: KeyPair; signature: Uint8Array };
  prekeys: Record<number, KeyPair>;
  nextPrekeyId: number;
}

interface DeviceRecord {
  ik: Uint8Array;
  trust: Trust;
}

export interface Decrypted {
  /**
   * Content of the SCE envelope: the original <body>, <data> and whatever
   * else the sender put there, serialized back to XML. Undefined for empty
   * messages, which exist only to advance a session.
   */
  content?: string;
  /** 'own' - sent from this device, read back from the local cache. */
  trust: Trust | 'own';
  error?: string;
}

export interface DeviceInfo {
  id: number;
  fingerprint: string;
  trust: Trust | 'own';
}

const bare = (jid: string) => jid.split('/')[0].toLowerCase();
const sessionKey = (jid: string, id: number) => `session:${jid}:${id}`;
const trustKey = (jid: string) => `trust:${jid}`;
/** Keyed by room, since a MUC message id is unique within its room. */
const messageKey = (roomJid: string, id: string) =>
  `message:${bare(roomJid)}:${id}`;

/** Identity key fingerprint as shown to users: hex in groups of 8. */
export function formatFingerprint(ik: Uint8Array): string {
  return toHex(ik).match(/.{8}/g)!.join(' ');
}

function generateOwnKeys(): OwnKeys {
  const identity = generateIdentity();
  const spkPair = generateKeyPair();
  const prekeys: Record<number, KeyPair> = {};
  for (let id = 1; id <= PREKEY_COUNT; id++) prekeys[id] = generateKeyPair();
  return {
    deviceId: randomInt(1, 0x7fffffff),
    identity,
    spk: { id: 1, pair: spkPair, signature: sign(identity, spkPair.pub) },
    prekeys,
    nextPrekeyId: PREKEY_COUNT + 1,
  };
}

function formField(name: string, value: string, type?: string): Element {
  return xml('field', { var: name, type }, xml('value', {}, value));
}

function isItemNotFound(err: unknown): boolean {
  return (err as { condition?: string })?.condition === 'item-not-found';
}

/**
 * The node exists, but its stored configuration does not satisfy the
 * precondition our publish-options ask for.
 *
 * This is how server-side node config drift surfaces: change `max_items_node`
 * (or force a node config) after accounts already created their OMEMO nodes,
 * and every one of those accounts starts failing here - permanently, since
 * nothing ever rewrites the node. See publishWithRecovery.
 */
function isPreconditionNotMet(err: unknown): boolean {
  const condition = (err as { condition?: string })?.condition;
  return condition === 'precondition-not-met' || condition === 'conflict';
}

/** OMEMO 2 for one account on this device, across the MUC rooms it is in. */
export class Omemo {
  /** Our own bare JID. */
  readonly jid: string;
  private readonly xmpp: Client;
  private readonly store: OmemoStore;
  private keys: OwnKeys;
  private queue: Promise<unknown> = Promise.resolve();
  private deviceLists = new Map<string, { ids: number[]; at: number }>();

  private constructor(
    xmpp: Client,
    jid: string,
    store: OmemoStore,
    keys: OwnKeys
  ) {
    this.xmpp = xmpp;
    this.jid = jid;
    this.store = store;
    this.keys = keys;
  }

  /** Loads (or creates) this device's keys and publishes them. */
  static async create(
    xmpp: Client,
    jid: string,
    store: OmemoStore
  ): Promise<Omemo> {
    let keys = await store.get<OwnKeys>('keys');
    if (!keys) {
      keys = generateOwnKeys();
      await store.set('keys', keys);
    }
    const omemo = new Omemo(xmpp, bare(jid), store, keys);
    await omemo.publishBundle();
    await omemo.announceDevice();
    return omemo;
  }

  get deviceId(): number {
    return this.keys.deviceId;
  }

  get fingerprint(): string {
    return formatFingerprint(this.keys.identity.pub);
  }

  /** Runs tasks one at a time: sessions and keys are read-modify-write. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  // -- PEP ---------------------------------------------------

  /**
   * Publishes, and repairs the node if its configuration blocks us.
   *
   * Without this, one server-side change to the PEP node configuration locks
   * every existing account out of publishing its keys for good: the device
   * can never announce itself, so nobody can encrypt to it and it cannot send
   * (we refuse to fall back to plaintext). Reconfiguring is tried first
   * because it keeps the published items; deleting the node is the last
   * resort, and costs only bundles that every device republishes on its next
   * login anyway.
   */
  private async publishWithRecovery(
    node: string,
    itemId: string,
    payload: Element,
    maxItems?: string
  ) {
    try {
      await this.publish(node, itemId, payload, maxItems);
      return;
    } catch (err) {
      if (!isPreconditionNotMet(err)) throw err;
      console.warn(`OMEMO: ${node} rejected our publish-options, repairing`);
    }

    try {
      await this.configureNode(node, maxItems);
      await this.publish(node, itemId, payload, maxItems);
      return;
    } catch (err) {
      if (!isPreconditionNotMet(err)) throw err;
      console.warn(`OMEMO: reconfiguring ${node} did not help, recreating it`);
    }

    await this.deleteNode(node);
    await this.publish(node, itemId, payload, maxItems);
  }

  /** Rewrites an existing node's configuration to what we publish against. */
  private async configureNode(node: string, maxItems?: string) {
    const fields: Element[] = [
      formField(
        'FORM_TYPE',
        'http://jabber.org/protocol/pubsub#node_config',
        'hidden'
      ),
      formField('pubsub#access_model', 'open'),
      formField('pubsub#persist_items', 'true'),
    ];
    if (maxItems) fields.push(formField('pubsub#max_items', maxItems));
    await this.xmpp.iqCaller.request(
      xml(
        'iq',
        { type: 'set' },
        xml(
          'pubsub',
          { xmlns: NS_PUBSUB_OWNER },
          xml(
            'configure',
            { node },
            xml('x', { xmlns: 'jabber:x:data', type: 'submit' }, ...fields)
          )
        )
      )
    );
  }

  private async deleteNode(node: string) {
    await this.xmpp.iqCaller.request(
      xml(
        'iq',
        { type: 'set' },
        xml('pubsub', { xmlns: NS_PUBSUB_OWNER }, xml('delete', { node }))
      )
    );
  }

  private async publish(
    node: string,
    itemId: string,
    payload: Element,
    maxItems?: string
  ) {
    const fields: Element[] = [
      formField(
        'FORM_TYPE',
        'http://jabber.org/protocol/pubsub#publish-options',
        'hidden'
      ),
      formField('pubsub#access_model', 'open'),
    ];
    if (maxItems) fields.push(formField('pubsub#max_items', maxItems));
    const options = xml(
      'publish-options',
      {},
      xml('x', { xmlns: 'jabber:x:data', type: 'submit' }, ...fields)
    );
    await this.xmpp.iqCaller.request(
      xml(
        'iq',
        { type: 'set' },
        xml(
          'pubsub',
          { xmlns: NS_PUBSUB },
          xml('publish', { node }, xml('item', { id: itemId }, payload)),
          options
        )
      )
    );
  }

  private async fetchItems(
    jid: string,
    node: string,
    itemId?: string
  ): Promise<Element[]> {
    try {
      const res = await this.xmpp.iqCaller.request(
        xml(
          'iq',
          { type: 'get', to: jid },
          xml(
            'pubsub',
            { xmlns: NS_PUBSUB },
            xml(
              'items',
              { node },
              ...(itemId ? [xml('item', { id: itemId })] : [])
            )
          )
        )
      );
      return (
        res
          .getChild('pubsub', NS_PUBSUB)
          ?.getChild('items')
          ?.getChildren('item') ?? []
      );
    } catch (err) {
      if (isItemNotFound(err)) return [];
      throw err;
    }
  }

  private async fetchDeviceList(jid: string): Promise<Element[]> {
    const items = await this.fetchItems(jid, NODE_DEVICES);
    const list = items.find((i) => i.attrs.id === 'current') ?? items[0];
    return (
      list?.getChild('devices', NS_OMEMO)?.getChildren('device') ?? []
    ).filter((d) => {
      const id = Number(d.attrs.id);
      return Number.isInteger(id) && id > 0 && id <= 0xffffffff;
    });
  }

  private async deviceIds(jid: string, fresh = false): Promise<number[]> {
    const cached = this.deviceLists.get(jid);
    if (cached && !fresh && Date.now() - cached.at < DEVICE_LIST_TTL) {
      return cached.ids;
    }
    const ids = (await this.fetchDeviceList(jid)).map((d) =>
      Number(d.attrs.id)
    );
    this.deviceLists.set(jid, { ids, at: Date.now() });
    return ids;
  }

  /** Adds this device to our published device list. */
  private async announceDevice() {
    const devices = await this.fetchDeviceList(this.jid);
    if (devices.some((d) => Number(d.attrs.id) === this.deviceId)) return;
    const list = xml(
      'devices',
      { xmlns: NS_OMEMO },
      ...devices.map((d) =>
        xml('device', { id: d.attrs.id, label: d.attrs.label })
      ),
      xml('device', { id: String(this.deviceId), label: 'Web' })
    );
    await this.publishWithRecovery(NODE_DEVICES, 'current', list);
    this.deviceLists.delete(this.jid);
  }

  private async publishBundle() {
    const { identity, spk, prekeys } = this.keys;
    const bundle = xml(
      'bundle',
      { xmlns: NS_OMEMO },
      xml('spk', { id: String(spk.id) }, toBase64(spk.pair.pub)),
      xml('spks', {}, toBase64(spk.signature)),
      xml('ik', {}, toBase64(identity.pub)),
      xml(
        'prekeys',
        {},
        ...Object.entries(prekeys).map(([id, pk]) =>
          xml('pk', { id }, toBase64(pk.pub))
        )
      )
    );
    await this.publishWithRecovery(
      NODE_BUNDLES,
      String(this.deviceId),
      bundle,
      'max'
    );
  }

  private async fetchBundle(jid: string, id: number): Promise<Bundle> {
    const items = await this.fetchItems(jid, NODE_BUNDLES, String(id));
    const el = items
      .find((i) => i.attrs.id === String(id))
      ?.getChild('bundle', NS_OMEMO);
    const spk = el?.getChild('spk');
    const prekeys = el?.getChild('prekeys')?.getChildren('pk') ?? [];
    if (!el || !spk || prekeys.length === 0) {
      throw new Error(`No usable bundle for ${jid}/${id}`);
    }
    const pk = prekeys[randomInt(0, prekeys.length - 1)];
    return {
      ik: fromBase64(el.getChildText('ik') ?? ''),
      spkId: Number(spk.attrs.id),
      spk: fromBase64(spk.text()),
      spkSignature: fromBase64(el.getChildText('spks') ?? ''),
      pkId: Number(pk.attrs.id),
      pk: fromBase64(pk.text()),
    };
  }

  // -- Trust -------------------------------------------------

  /** Records the device's identity key on first sight and returns its trust. */
  private async trustOf(
    jid: string,
    id: number,
    ik: Uint8Array
  ): Promise<Trust> {
    const records =
      (await this.store.get<Record<number, DeviceRecord>>(trustKey(jid))) ?? {};
    const known = records[id];
    if (known && bytesEqual(known.ik, ik)) return known.trust;

    // A new device, or a known device ID with a different key (never trusted blindly)
    const hasVerified = Object.values(records).some(
      (r) => r.trust === 'verified'
    );
    const trust: Trust = known || hasVerified ? 'untrusted' : 'blind';
    records[id] = { ik, trust };
    await this.store.set(trustKey(jid), records);
    return trust;
  }

  /** Devices of `jid` (fetching unknown bundles), including this one for our own JID. */
  devices(jid: string): Promise<DeviceInfo[]> {
    const target = bare(jid);
    return this.serial(async () => {
      const result: DeviceInfo[] = [];
      for (const id of await this.deviceIds(target, true)) {
        if (target === this.jid && id === this.deviceId) {
          result.push({ id, fingerprint: this.fingerprint, trust: 'own' });
          continue;
        }
        const records =
          (await this.store.get<Record<number, DeviceRecord>>(
            trustKey(target)
          )) ?? {};
        try {
          const ik = records[id]?.ik ?? (await this.fetchBundle(target, id)).ik;
          const trust = await this.trustOf(target, id, ik);
          result.push({ id, fingerprint: formatFingerprint(ik), trust });
        } catch (err) {
          console.warn(`OMEMO: no bundle for ${target}/${id}:`, err);
        }
      }
      return result;
    });
  }

  setTrust(jid: string, id: number, trust: Trust): Promise<void> {
    const target = bare(jid);
    return this.serial(async () => {
      const records =
        (await this.store.get<Record<number, DeviceRecord>>(
          trustKey(target)
        )) ?? {};
      if (!records[id]) throw new Error('Unknown device');
      records[id].trust = trust;
      await this.store.set(trustKey(target), records);
    });
  }

  // -- Encryption --------------------------------------------

  /** Encrypts `keyMaterial` for every trusted device of `jid` (except this one). */
  private async encryptKey(
    jid: string,
    keyMaterial: Uint8Array
  ): Promise<Element[]> {
    const keys: Element[] = [];
    for (const id of await this.deviceIds(jid)) {
      if (jid === this.jid && id === this.deviceId) continue;
      try {
        let session = await this.store.get<Session>(sessionKey(jid, id));
        if (!session) {
          const bundle = await this.fetchBundle(jid, id);
          if ((await this.trustOf(jid, id, bundle.ik)) === 'untrusted')
            continue;
          session = initiateSession(this.keys.identity, bundle);
        } else if (
          (await this.trustOf(jid, id, session.peerIk)) === 'untrusted'
        ) {
          continue;
        }

        const [next, data] = ratchetEncrypt(session, keyMaterial);
        await this.store.set(sessionKey(jid, id), next);
        // Until the device answers, every message repeats the key exchange
        const kex = next.pendingKex;
        const encoded = kex
          ? encodeKeyExchange({
              ...kex,
              ik: this.keys.identity.pub,
              message: data,
            })
          : data;
        keys.push(
          xml(
            'key',
            { rid: String(id), kex: kex ? 'true' : undefined },
            toBase64(encoded)
          )
        );
      } catch (err) {
        console.warn(`OMEMO: skipping device ${jid}/${id}:`, err);
      }
    }
    return keys;
  }

  /**
   * Builds the encrypted groupchat stanza for `roomJid`.
   *
   * `content` are the children the plaintext stanza would have carried
   * (<body>, <data>, ...); all of them go inside the SCE envelope. `members`
   * are the bare JIDs of everyone in the room - ours is added automatically
   * so our other devices can read it too. `id` must be the id the plaintext
   * stanza would have used, because the optimistic UI matches the room's
   * echo by it.
   */
  encryptGroupMessage(
    roomJid: string,
    members: string[],
    content: Element[],
    id: string
  ): Promise<Element> {
    return this.serial(async () => {
      const room = bare(roomJid);
      const recipients = Array.from(
        new Set([...members.map(bare), this.jid].filter(Boolean))
      );

      const envelope = xml(
        'envelope',
        { xmlns: NS_SCE },
        xml('content', {}, ...content),
        xml('rpad', {}, toBase64(randomBytes(randomInt(0, 48)))),
        xml('time', { stamp: new Date().toISOString() }),
        // In a MUC the envelope is addressed to the room, and `from` is our
        // real JID - which is what the receiving side resolves the room nick
        // back to before comparing.
        xml('to', { jid: room }),
        xml('from', { jid: this.jid })
      );
      const { keyMaterial, payload } = encryptPayload(
        new TextEncoder().encode(envelope.toString())
      );

      const blocks: Element[] = [];
      const unreachable: string[] = [];
      for (const jid of recipients) {
        let keys = await this.encryptKey(jid, keyMaterial);
        if (keys.length === 0 && jid !== this.jid) {
          // The member may have just added a device
          this.deviceLists.delete(jid);
          keys = await this.encryptKey(jid, keyMaterial);
        }
        if (keys.length > 0) blocks.push(xml('keys', { jid }, ...keys));
        else if (jid !== this.jid) unreachable.push(jid);
      }
      if (blocks.length === 0) {
        // Never fall back to plaintext: the room is encrypted or it fails.
        // Name the members so the reason is findable - "nobody in this room
        // has ever opened it with encryption on" is the usual answer, and it
        // is invisible from the UI.
        throw new Error(
          `omemo_no_recipients: no published OMEMO device for ${
            unreachable.join(', ') || 'any member'
          } - they have to open the chat with encryption enabled at least once`
        );
      }

      // The room reflects our own message back, but we deliberately do not
      // encrypt to this device, so that echo can never be decrypted here.
      // Keep the plaintext under the id the echo will carry.
      await this.store.set(messageKey(room, id), {
        content: content.map((c) => c.toString()).join(''),
        trust: 'own',
      } satisfies Decrypted);

      return xml(
        'message',
        { type: 'groupchat', to: room, id },
        xml(
          'encrypted',
          { xmlns: NS_OMEMO },
          xml('header', { sid: String(this.deviceId) }, ...blocks),
          xml('payload', {}, toBase64(payload))
        ),
        xml('encryption', {
          xmlns: 'urn:xmpp:eme:0',
          namespace: NS_OMEMO,
          name: 'OMEMO',
        }),
        xml('store', { xmlns: 'urn:xmpp:hints' }),
        xml('origin-id', { xmlns: 'urn:xmpp:sid:0', id }),
        xml('body', {}, FALLBACK_BODY)
      );
    });
  }

  /**
   * Empty OMEMO message: completes a session the peer started. It targets one
   * device, so it goes straight to that member's real JID rather than through
   * the room.
   */
  private async sendEmpty(jid: string, id: number) {
    const session = await this.store.get<Session>(sessionKey(jid, id));
    if (!session) return;
    const [next, data] = ratchetEncrypt(session, new Uint8Array(32));
    await this.store.set(sessionKey(jid, id), next);
    await this.xmpp.send(
      xml(
        'message',
        { type: 'chat', to: jid, id: `omemo-empty-${Date.now().toString(36)}` },
        xml(
          'encrypted',
          { xmlns: NS_OMEMO },
          xml(
            'header',
            { sid: String(this.deviceId) },
            xml(
              'keys',
              { jid },
              xml('key', { rid: String(id) }, toBase64(data))
            )
          )
        ),
        // Only the target device needs it: no archive, no carbons
        xml('no-permanent-store', { xmlns: 'urn:xmpp:hints' }),
        xml('no-copy', { xmlns: 'urn:xmpp:hints' }),
        xml('private', { xmlns: 'urn:xmpp:carbons:2' })
      )
    );
  }

  // -- Decryption --------------------------------------------

  /**
   * Decrypts one OMEMO stanza. `sender` is the real bare JID of the author
   * (resolved from the room nick by the caller) and `roomJid` the room it
   * arrived in. Returns undefined when the stanza carries no OMEMO payload.
   */
  decrypt(
    el: Element,
    sender: string,
    roomJid: string
  ): Promise<Decrypted> | undefined {
    const encrypted = el.getChild('encrypted', NS_OMEMO);
    if (!encrypted) return undefined;
    const from = bare(sender);
    const room = bare(roomJid);

    return this.serial(async () => {
      const cacheId = el.attrs.id && messageKey(room, el.attrs.id);
      if (cacheId) {
        const cached = await this.store.get<Decrypted>(cacheId);
        if (cached) return cached;
      }
      // Empty messages are not shown, so their failures don't matter either
      const empty = !encrypted.getChild('payload');
      try {
        const result = await this.decryptUncached(encrypted, from, room);
        if (empty) return { trust: result.trust };
        // Also makes repeated deliveries (live + mucsub + archive) idempotent
        if (cacheId && !result.error) await this.store.set(cacheId, result);
        return result;
      } catch (err) {
        if (empty) return { trust: 'untrusted' };
        console.warn('OMEMO: decryption failed:', err);
        return { trust: 'untrusted', error: 'omemo_decrypt_failed' };
      }
    });
  }

  private async decryptUncached(
    encrypted: Element,
    sender: string,
    roomJid: string
  ): Promise<Decrypted> {
    const header = encrypted.getChild('header');
    const sid = Number(header?.attrs.sid);
    if (!header || !Number.isInteger(sid))
      throw new Error('Invalid OMEMO header');
    if (sender === this.jid && sid === this.deviceId) {
      return { trust: 'own', error: 'omemo_own_message_not_cached' };
    }

    const keyEl = header
      .getChildren('keys')
      .filter((k) => bare(k.attrs.jid ?? '') === this.jid)
      .flatMap((k) => k.getChildren('key'))
      .find((k) => Number(k.attrs.rid) === this.deviceId);
    if (!keyEl) {
      return {
        trust: 'untrusted',
        error: 'omemo_not_encrypted_for_this_device',
      };
    }

    const data = fromBase64(keyEl.text());
    const existing = await this.store.get<Session>(sessionKey(sender, sid));
    let session: Session;
    let keyMaterial: Uint8Array;
    let usedPrekey: number | undefined;

    if (keyEl.attrs.kex === 'true' || keyEl.attrs.kex === '1') {
      const kex = decodeKeyExchange(data);
      if (
        existing?.kexEk &&
        bytesEqual(existing.kexEk, kex.ek) &&
        bytesEqual(existing.peerIk, kex.ik)
      ) {
        // Repeated key exchange of a session we already accepted
        [session, keyMaterial] = ratchetDecrypt(existing, kex.message);
      } else {
        const pk = this.keys.prekeys[kex.pkId];
        if (kex.spkId !== this.keys.spk.id || !pk)
          throw new Error('Unknown prekey');
        const accepted = acceptSession(
          this.keys.identity,
          this.keys.spk.pair,
          pk,
          kex.ik,
          kex.ek
        );
        [session, keyMaterial] = ratchetDecrypt(accepted, kex.message);
        usedPrekey = kex.pkId;
      }
    } else {
      if (!existing) throw new Error('No session with the sender device');
      [session, keyMaterial] = ratchetDecrypt(existing, data);
    }
    // The device answered: no need to repeat our key exchange
    session.pendingKex = undefined;

    const payload = encrypted.getChildText('payload');
    const content = payload
      ? this.openEnvelope(
          decryptPayload(keyMaterial, fromBase64(payload)),
          sender,
          roomJid
        )
      : undefined;
    const trust = await this.trustOf(sender, sid, session.peerIk);
    await this.store.set(sessionKey(sender, sid), session);

    if (usedPrekey !== undefined) {
      await this.replacePrekey(usedPrekey);
      // After this task: republish the bundle and confirm the new session
      void this.serial(async () => {
        await this.publishBundle();
        await this.sendEmpty(sender, sid);
      }).catch((err) =>
        console.warn('OMEMO: failed to complete key exchange:', err)
      );
    }
    return { content, trust };
  }

  /**
   * Checks the SCE envelope (XEP-0420) and returns its content as XML.
   *
   * The from/to check is what stops one member replaying another's encrypted
   * message under their own nick: `from` must be the JID the room nick
   * resolves to, and `to` must be the room the stanza arrived in.
   */
  private openEnvelope(
    bytes: Uint8Array,
    sender: string,
    roomJid: string
  ): string {
    const envelope = parse(new TextDecoder().decode(bytes));
    if (!envelope.is('envelope', NS_SCE))
      throw new Error('Not an SCE envelope');
    const from = envelope.getChild('from')?.attrs.jid;
    const to = envelope.getChild('to')?.attrs.jid;
    if (!from || bare(from) !== sender)
      throw new Error('Envelope sender mismatch');
    if (!to || bare(to) !== roomJid)
      throw new Error('Envelope recipient mismatch');
    return (envelope.getChild('content')?.children ?? [])
      .map((c) => (typeof c === 'string' ? c : (c as Element).toString()))
      .join('');
  }

  private async replacePrekey(id: number) {
    const keys = structuredClone(this.keys);
    delete keys.prekeys[id];
    keys.prekeys[keys.nextPrekeyId++] = generateKeyPair();
    await this.store.set('keys', keys);
    this.keys = keys;
  }
}

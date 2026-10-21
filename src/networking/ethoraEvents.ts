import type { Element } from 'ltx';
import { store } from '../roomStore';
import { updateRoom } from '../roomStore/roomsSlice';
import { isSafeKey, hasSafeIdSegments } from '../roomStore/safeKey';
import { getRoomByName } from './api-requests/rooms.api';
import { createRoomFromApi } from '../helpers/createRoomFromApi';
import { getRoomUserCount } from '../helpers/roomUserCount';
import { refreshUser } from '../helpers/userResolver';
import { ethoraLogger } from '../helpers/ethoraLogger';
import { publishChatComponentConfigUpdated } from '../helpers/chatComponentConfigEvents';
import type { IRoom } from '../types/types';

/**
 * Server push `<ethora-event xmlns="urn:ethora:events:1" .../>` inside a
 * `type="headline"` message from the server's admin account:
 *
 *   user-profile-updated  xmppUsername="<appId>_<userId>" uuid appId
 *   chat-meta-updated     chatName="<appId>_<roomId>" appId
 *   chat-component-config-updated  appId version
 *
 * The last one is how a change in the admin's Chat component tab reaches
 * open chats. The server sends it to every online session of its XMPP host
 * in one go (ejabberd `announce/online`), so it arrives FROM the bare server
 * domain and for any App on the host: it is only acted on when `appId` is
 * this session's own App.
 *
 * The payload is a pointer only. The client re-reads the user or the room
 * through the normal API, so nothing in the stanza is ever shown or stored.
 * Everything in the stanza is untrusted input until proven otherwise.
 */
export const ETHORA_EVENT_XMLNS = 'urn:ethora:events:1';
export const ETHORA_EVENT_USER_PROFILE = 'user-profile-updated';
export const ETHORA_EVENT_CHAT_META = 'chat-meta-updated';
export const ETHORA_EVENT_CHAT_COMPONENT_CONFIG = 'chat-component-config-updated';

const MUCSUB_EVENT_NS = 'http://jabber.org/protocol/pubsub#event';
const ROOM_DEBOUNCE_MS = 500;
const MAX_KEY_LENGTH = 128;
const KEY_SHAPE = /^[A-Za-z0-9_-]+$/;
const ROOM_BACKOFF_MS = [5_000, 30_000, 120_000];

type HostLike = { host?: string; client?: { jid?: { getDomain?: () => string } } };

const lower = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** Server domain of this session: our own JID's domain, else the configured host. */
const sessionDomain = (xmppWs: HostLike | undefined): string =>
  lower(xmppWs?.client?.jid?.getDomain?.()) || lower(xmppWs?.host);

/**
 * True when a headline came from the server and not from a user or a room.
 * - from must be a BARE jid (a user's c2s stanza or a MUC occupant always
 *   carries a resource, and the server stamps it, so it cannot be spoofed)
 * - its domain must be the session's own XMPP domain (not conference.*, not
 *   another server)
 * - when config.trustedEventSenders is set, the sender must be listed
 * The server's admin local part is deployment config (XMPP_ADMIN), so it
 * cannot be hard-coded here.
 *
 * `allowServerDomain` also accepts the bare server domain itself as the
 * sender (what ejabberd stamps on a host-wide announcement). A client cannot
 * send as the domain: the server fixes `from` on every client stanza. A
 * pinned `trustedEventSenders` list then has to name the domain.
 */
export const isTrustedEventSender = (
  stanza: Element,
  xmppWs: HostLike | undefined,
  allowServerDomain = false
): boolean => {
  const from = String(stanza?.attrs?.from ?? '').trim();
  if (!from || from.includes('/')) return false;
  const at = from.indexOf('@');
  if (allowServerDomain && at === -1) {
    const domainOnly = lower(from);
    const ownDomain = sessionDomain(xmppWs);
    if (!ownDomain || domainOnly !== ownDomain) return false;
    const pins = (store.getState().chatSettingStore?.config as any)
      ?.trustedEventSenders;
    return !(Array.isArray(pins) && pins.length) ||
      pins.some((entry: unknown) => lower(entry) === domainOnly);
  }
  if (at <= 0 || from.indexOf('@', at + 1) !== -1) return false;
  const local = lower(from.slice(0, at));
  const domain = lower(from.slice(at + 1));
  if (!local || !domain) return false;
  const own = sessionDomain(xmppWs);
  if (!own || domain !== own) return false;

  const pinned = (store.getState().chatSettingStore?.config as any)
    ?.trustedEventSenders;
  if (Array.isArray(pinned) && pinned.length) {
    return pinned.some((entry: unknown) => {
      const e = lower(entry);
      return e === `${local}@${domain}` || e === local;
    });
  }
  return true;
};

const sessionAppId = (): string =>
  String(store.getState().chatSettingStore?.appId || '').trim();

/**
 * `<appId>_<id>` shape for an attribute that is about to become a URL
 * segment or a store key: charset, length cap, no unsafe key, and the
 * session's appId as prefix when the session has one.
 */
const isSafeEventKey = (value: unknown): value is string => {
  if (!isSafeKey(value)) return false;
  if (value.length > MAX_KEY_LENGTH || !KEY_SHAPE.test(value)) return false;
  if (!value.includes('_')) return false;
  if (!hasSafeIdSegments(value)) return false;
  const appId = sessionAppId();
  if (appId && !value.startsWith(`${appId}_`)) return false;
  return true;
};

// --- chat-meta-updated -----------------------------------------------------

const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();
const roomInflight = new Set<string>();
const roomAgain = new Set<string>();
const roomFailures = new Map<string, { count: number; until: number }>();

const findRoomJid = (chatName: string): string | null => {
  const rooms = (store.getState().rooms?.rooms || {}) as Record<string, IRoom>;
  for (const jid of Object.keys(rooms)) {
    if (jid.split('@')[0] === chatName) return jid;
  }
  return null;
};

const runRoomRefresh = async (chatName: string): Promise<void> => {
  if (roomInflight.has(chatName)) {
    roomAgain.add(chatName);
    return;
  }
  const failure = roomFailures.get(chatName);
  if (failure && failure.until > Date.now()) return;
  const jid = findRoomJid(chatName);
  if (!jid || !store.getState().chatSettingStore?.user?.token) return;

  roomInflight.add(chatName);
  try {
    const apiRoom = await getRoomByName(chatName);
    roomFailures.delete(chatName);
    const current = (store.getState().rooms?.rooms || {})[jid] as
      | IRoom
      | undefined;
    if (!current || !apiRoom) return;
    const service = jid.split('@')[1] || '';
    // createRoomFromApi applies the title rules (private chats derive the
    // peer name, sentinel titles are refused) and the usersCnt rules
    const fresh = createRoomFromApi(
      { ...apiRoom, name: chatName },
      service,
      getRoomUserCount(current)
    );
    if (!fresh) return;

    // Metadata only. members, messages, lastMessage and the unread fields
    // stay as they are: the response carries the whole member list (a big
    // room is tens of KB) and the loaded one may be a different, larger set.
    const updates: Partial<IRoom> = {
      title: fresh.title,
      name: fresh.name,
      description: fresh.description,
      picture: fresh.picture,
      icon: fresh.icon,
      // never lower the known total
      usersCnt: Math.max(
        Number(fresh.usersCnt) || 0,
        getRoomUserCount(current)
      ),
    };
    if (
      apiRoom.type === 'public' ||
      apiRoom.type === 'group' ||
      apiRoom.type === 'private'
    ) {
      updates.type = apiRoom.type;
    }
    // A missing field in the answer must not blank the one we have
    (Object.keys(updates) as Array<keyof IRoom>).forEach((k) => {
      if ((updates as any)[k] === undefined) delete (updates as any)[k];
    });
    store.dispatch(updateRoom({ jid, updates }));
  } catch (error) {
    const count = (roomFailures.get(chatName)?.count ?? 0) + 1;
    roomFailures.set(chatName, {
      count,
      until:
        Date.now() +
        ROOM_BACKOFF_MS[Math.min(count - 1, ROOM_BACKOFF_MS.length - 1)],
    });
    ethoraLogger.log('[EthoraEvent] room refresh failed', chatName, error);
  } finally {
    roomInflight.delete(chatName);
    if (roomAgain.delete(chatName)) scheduleRoomRefresh(chatName);
  }
};

const scheduleRoomRefresh = (chatName: string): void => {
  const prior = roomTimers.get(chatName);
  if (prior) clearTimeout(prior);
  roomTimers.set(
    chatName,
    setTimeout(() => {
      roomTimers.delete(chatName);
      void runRoomRefresh(chatName);
    }, ROOM_DEBOUNCE_MS)
  );
};

// --- chat-component-config-updated ------------------------------------------

const CONFIG_EVENT_DEBOUNCE_MS = 300;
const VERSION_SHAPE = /^[A-Za-z0-9._-]{1,40}$/;
const APP_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

const configTimers = new Map<string, ReturnType<typeof setTimeout>>();
const configSeen = new Map<string, string>();

/** The Apps this session may hear about: its own, and the one `remoteAppearance` reads. */
const ownAppIds = (): string[] => {
  const cfg = store.getState().chatSettingStore?.config as any;
  return [sessionAppId(), String(cfg?.remoteAppearance?.appId ?? '').trim()].filter(
    Boolean
  );
};

const handleConfigUpdated = (event: Element | undefined): void => {
  const appId = String(event?.attrs?.appId ?? '').trim();
  const version = String(event?.attrs?.version ?? '').trim();
  if (!APP_SHAPE.test(appId) || !VERSION_SHAPE.test(version)) return;
  // The announcement reaches every App on the host
  if (!ownAppIds().includes(appId)) return;
  // Same version again: another session of this user, or a resend
  if (configSeen.get(appId) === version) return;

  const prior = configTimers.get(appId);
  if (prior) clearTimeout(prior);
  configTimers.set(
    appId,
    setTimeout(() => {
      configTimers.delete(appId);
      if (configSeen.get(appId) === version) return;
      configSeen.set(appId, version);
      const payload = { appId, version };
      try {
        const cb = (store.getState().chatSettingStore?.config as any)
          ?.eventHandlers?.onChatComponentConfigUpdated;
        if (typeof cb === 'function') cb(payload);
      } catch (error) {
        ethoraLogger.log('[EthoraEvent] onChatComponentConfigUpdated threw', error);
      }
      publishChatComponentConfigUpdated(payload);
    }, CONFIG_EVENT_DEBOUNCE_MS)
  );
};

// --- entry point ------------------------------------------------------------

const findCarrier = (stanza: Element): Element | null => {
  const candidates: Element[] = [stanza];
  const inner = stanza
    ?.getChild?.('event', MUCSUB_EVENT_NS)
    ?.getChild?.('items')
    ?.getChild?.('item')
    ?.getChild?.('message');
  if (inner) candidates.push(inner as Element);
  return (
    candidates.find(
      (c) =>
        c?.attrs?.type === 'headline' &&
        c.getChild?.('ethora-event', ETHORA_EVENT_XMLNS)
    ) ?? null
  );
};

/**
 * Handles `<ethora-event>` headlines. Returns true when the stanza carried
 * one (trusted or not), so the caller can stop routing it. Unknown types,
 * malformed attributes and untrusted senders are ignored silently. Never
 * throws.
 */
export function onEthoraEvent(
  stanza: Element,
  xmppWs?: HostLike
): boolean {
  try {
    const carrier = findCarrier(stanza);
    if (!carrier) return false;
    const event = carrier.getChild('ethora-event', ETHORA_EVENT_XMLNS);
    const type = String(event?.attrs?.type ?? '');
    if (type === ETHORA_EVENT_CHAT_COMPONENT_CONFIG) {
      if (!isTrustedEventSender(carrier, xmppWs, true)) {
        ethoraLogger.log('[EthoraEvent] ignored: untrusted sender');
        return true;
      }
      handleConfigUpdated(event);
      return true;
    }
    if (!isTrustedEventSender(carrier, xmppWs)) {
      ethoraLogger.log('[EthoraEvent] ignored: untrusted sender');
      return true;
    }
    const appIdAttr = event?.attrs?.appId;
    const appId = sessionAppId();
    if (appIdAttr !== undefined && appId && String(appIdAttr) !== appId) {
      return true;
    }

    if (type === ETHORA_EVENT_USER_PROFILE) {
      const id = event?.attrs?.xmppUsername;
      if (isSafeEventKey(id)) refreshUser(id);
    } else if (type === ETHORA_EVENT_CHAT_META) {
      const chatName = event?.attrs?.chatName;
      // a room we do not hold (a brand-new room we were just added to) is
      // the invite/membership flow's job
      if (isSafeEventKey(chatName) && findRoomJid(chatName)) {
        scheduleRoomRefresh(chatName);
      }
    }
    return true;
  } catch (error) {
    ethoraLogger.log('[EthoraEvent] failed to handle event', error);
    return true;
  }
}

/** Drops timers and per-room state (tests, logout). */
export function resetEthoraEvents(): void {
  roomTimers.forEach((t) => clearTimeout(t));
  roomTimers.clear();
  roomInflight.clear();
  roomAgain.clear();
  roomFailures.clear();
  configTimers.forEach((t) => clearTimeout(t));
  configTimers.clear();
  configSeen.clear();
}

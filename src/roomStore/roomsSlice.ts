import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import {
  AddRoomMessageAction,
  ApiRoom,
  EditAction,
  IMessage,
  IRoom,
  ReactionAction,
  RoomMember,
  Translation,
} from '../types/types';
import { insertMessageWithDelimiter } from '../helpers/insertMessageWithDelimiter';
import XmppClient from '../networking/xmppClient';
import {
  createUserNameFromSetUser,
  resolveSenderDisplayName,
} from '../helpers/createUserNameFromSetUser';
import { extractUniqueMembersFromRooms } from '../helpers/extractUniqueMembersFromRooms';
import { getTimestampFromUnknown } from '../helpers/timestamp';

// Body strings the server uses for call signaling broadcasts (call-token,
// call-state ringing/ended, etc). These should never reach the chat
// transcript or the sidebar "last message" preview - they're control
// frames, not user-visible content. The XMPP handler (onCallTokenMessage)
// already swallows them in the live stream, but they can still arrive via
// MAM history, mucsub catchup, or be present in persisted state from
// before that filter existed. Drop them at the reducer boundary so the
// transcript stays clean regardless of source.
const CALL_SIGNAL_BODIES = new Set([
  'call-token',
  'call-state',
  'call-ringing',
  'call-ended',
  'call-declined',
  'call-cancelled',
  'call-canceled',
  'call-timeout',
  'call-rejected',
  'call-invite',
]);

const isCallSignalMessage = (message: IMessage | undefined | null): boolean => {
  if (!message) return false;
  const body = String(message.body || '').trim().toLowerCase();
  return CALL_SIGNAL_BODIES.has(body);
};

const stripCallSignals = (messages: IMessage[] | undefined): IMessage[] =>
  Array.isArray(messages)
    ? messages.filter((message) => !isCallSignalMessage(message))
    : [];

// True for the client-side call-log fallback written at hangup: it exists
// only in this client's store (id "calllog-<callId>"), never on the server.
const isLocalCallLogEntry = (message: IMessage | undefined | null): boolean =>
  String(message?.id || '').startsWith('calllog-');

// Merge two log entries for the SAME callId into one. Identity (id/date/
// xmppId) comes from the server copy when one side is the local fallback -
// the server archive id is what MAM pages and the catch-up anchor will match
// against later. Display (body/callLog) comes from whichever copy saw the
// larger duration, so partial per-participant call-states don't shrink it.
const mergeCallLogEntries = (a: IMessage, b: IMessage): IMessage => {
  const aLocal = isLocalCallLogEntry(a);
  const bLocal = isLocalCallLogEntry(b);
  const identity = aLocal === bLocal ? a : aLocal ? b : a;
  const display =
    (a.callLog?.durationMs || 0) >= (b.callLog?.durationMs || 0) ? a : b;
  if (identity === display) return identity;
  return {
    ...display,
    id: identity.id,
    xmppId: (identity as IMessage).xmppId ?? (display as IMessage).xmppId,
    date: identity.date ?? display.date,
  };
};

// Collapse call-log duplicates for the same callId inside a merged history
// list (the live path dedups in addRoomMessage, but a MAM page merged over a
// persisted local fallback entry would otherwise show the call twice).
const collapseCallLogDuplicates = (messages: IMessage[]): IMessage[] => {
  const byCallId = new Map<string, IMessage>();
  let hasDuplicates = false;
  for (const message of messages) {
    const callId = message?.callLog?.callId;
    if (!callId) continue;
    const existing = byCallId.get(callId);
    if (existing) {
      hasDuplicates = true;
      byCallId.set(callId, mergeCallLogEntries(existing, message));
    } else {
      byCallId.set(callId, message);
    }
  }
  if (!hasDuplicates) return messages;
  const emitted = new Set<string>();
  return messages.filter((message) => {
    const callId = message?.callLog?.callId;
    if (!callId) return true;
    if (emitted.has(callId)) return false;
    emitted.add(callId);
    return true;
  }).map((message) => {
    const callId = message?.callLog?.callId;
    return callId ? byCallId.get(callId) || message : message;
  });
};

/**
 * Draft caps. Drafts ride along in the persisted rooms slice, so they have
 * to be bounded before they are written, not after:
 *
 *   30 rooms x 2,000 chars = 60,000 chars worst case, ~84,000 after the
 *   encrypt transform's ~1.4x inflation (~168 KB of the origin's ~5 MB).
 *
 * That is small next to PERSISTED_ROOMS_CHAR_BUDGET (1,000,000 chars) and,
 * because drafts are their own top-level slice key, it can never squeeze
 * the message cache the way the member roster once did. 2,000 chars is far
 * longer than any message anyone actually leaves half-typed; anything past
 * it is truncated rather than dropped, so the user still gets most of it
 * back.
 */
export const MAX_DRAFT_LENGTH = 2000;
export const MAX_PERSISTED_DRAFTS = 30;

interface RoomMessagesState {
  rooms: { [jid: string]: IRoom };
  activeRoomJID: string;
  isChatUiVisible: boolean;
  editAction?: EditAction;
  isLoading: boolean;
  usersSet: Record<string, RoomMember>;
  // Online MUC occupants per room (xmppUsernames with an available presence),
  // fed by available / type='unavailable' presence stanzas. Ephemeral.
  presenceByRoom: Record<string, string[]>;
  reportRoom: {
    isOpen: boolean;
  };
  subscribedRooms: string[];
  pushSubscriptionStatus: Record<string, 'pending' | 'subscribed' | 'error' | 'blocked'>;
  loadingText?: string;
  // Unsent composer text per room JID. Lives here rather than in the
  // composer's own useState so switching rooms (which never unmounts
  // SendInput) can hand each room back its own text, and so a reload gets
  // it back through the rooms slice's persistence. Deliberately NOT stored
  // on the room object: rooms carry the message cache and are the blob the
  // persist char budget fights over, while drafts are their own small,
  // separately capped key (see compactDraftsForPersist in roomStore/index).
  drafts: Record<string, string>;
}

interface PreloadRoomUpdate {
  jid: string;
  messages?: IMessage[];
  unreadCapped?: boolean;
  historyPreloadState?: 'idle' | 'loading' | 'partial' | 'done' | 'error';
}

const initialState: RoomMessagesState = {
  rooms: {},
  activeRoomJID: null,
  isChatUiVisible: false,
  isLoading: false,
  editAction: {
    isEdit: false,
    roomJid: '',
    messageId: '',
    text: '',
  },
  usersSet: {},
  presenceByRoom: {},
  reportRoom: {
    isOpen: false,
  },
  subscribedRooms: [],
  pushSubscriptionStatus: {},
  loadingText: undefined,
  drafts: {},
};

const firstPositiveTimestamp = (...values: unknown[]): number => {
  for (const value of values) {
    const ts = getTimestampFromUnknown(value);
    if (ts > 0) return ts;
  }
  return 0;
};

// A room without a read marker (the user never opened it on any device) must
// still get a non-zero unread cutoff, otherwise computeUnreadForRoom treats
// every message as "before the baseline" and the room-list badge can never
// appear for that room. Anchor the baseline at the newest message we already
// hold when the room first enters the store; rooms that arrive empty start
// counting from "now".
const resolveInitialUnreadBaseline = (messages: IMessage[]): number => {
  const latest = messages?.[messages.length - 1];
  const ts = firstPositiveTimestamp(
    latest?.date,
    (latest as { timestamp?: number })?.timestamp,
    latest?.id
  );
  return ts > 0 ? ts : Date.now();
};

const getNormalizedSubscribedRooms = (subscribedRooms: unknown): string[] =>
  Array.isArray(subscribedRooms)
    ? subscribedRooms.filter((room): room is string => typeof room === 'string')
    : [];

// MUC JIDs always look like `<localpart>@conference.<host>`. Slice keys leaking
// into `state.rooms` (e.g. when persisted state was double-wrapped and keys like
// 'rooms', 'subscribedRooms', 'usersSet', 'pushSubscriptionStatus' got rehydrated
// as room entries) corrupt the rooms map. The persist transform filters them on
// rehydrate, but reducers can still write a non-JID key if upstream code passes
// a malformed object. Guard at reducer entry so corrupt state can't be created
// in-memory either - without this, the next persist round would re-serialize
// the bad keys and presence/MAM keep targeting them.
const isValidRoomJid = (jid: unknown): jid is string => {
  if (typeof jid !== 'string' || !jid) return false;
  if (!jid.includes('@')) return false;
  return true;
};

const getMessageTimestampValue = (message: IMessage): number => {
  const hasExplicitTimestamp = Object.prototype.hasOwnProperty.call(
    message || {},
    'messageTimestampMs'
  );
  if (hasExplicitTimestamp) {
    return getTimestampFromUnknown((message as any)?.messageTimestampMs);
  }

  return (
    getTimestampFromUnknown(message?.date) ||
    getTimestampFromUnknown((message as any)?.timestamp) ||
    getTimestampFromUnknown((message as any)?.xmppId) ||
    getTimestampFromUnknown(message?.id)
  );
};

const getMessageKey = (message: IMessage): string =>
  String(message?.id || message?.xmppId || '');

const getMessageStableTieBreaker = (message: IMessage): string =>
  String(message?.xmppId || message?.id || '');

const compareMessageOrder = (a: IMessage, b: IMessage): number => {
  const tsA = getMessageTimestampValue(a);
  const tsB = getMessageTimestampValue(b);
  if (tsA !== tsB) {
    return tsA - tsB;
  }

  const pendingDelta = Number(Boolean(a?.pending)) - Number(Boolean(b?.pending));
  if (pendingDelta !== 0) {
    return pendingDelta;
  }

  const keyA = getMessageStableTieBreaker(a);
  const keyB = getMessageStableTieBreaker(b);
  if (keyA !== keyB) {
    return keyA.localeCompare(keyB);
  }

  return String(a?.body || '').localeCompare(String(b?.body || ''));
};

const enrichMessageAuthor = (
  message: IMessage,
  usersSet: Record<string, RoomMember>
): IMessage => {
  const name = resolveSenderDisplayName(message, usersSet);
  // Identity-preserving fast path: when the resolved name is already what the
  // message carries, return the same object so memoized message rows don't
  // re-render on every history merge.
  if (message.user && message.user.name === name) return message;
  return {
    ...message,
    user: {
      ...message.user,
      name,
    },
  };
};

// Cheap O(n) check so hot paths can skip a full O(n log n) re-sort when the
// transcript is already in order (the common case for live messages).
const isSortedByMessageOrder = (messages: IMessage[]): boolean => {
  for (let i = 1; i < messages.length; i++) {
    if (compareMessageOrder(messages[i - 1], messages[i]) > 0) return false;
  }
  return true;
};

const mergeRoomMessages = (
  existing: IMessage[],
  incoming: IMessage[],
  usersSet: Record<string, RoomMember>
): IMessage[] => {
  if (!incoming?.length) return existing || [];
  if (!existing?.length) {
    return incoming.map((message) => enrichMessageAuthor(message, usersSet));
  }

  const all = [...existing, ...incoming];

  const echoedClientIds = new Set<string>();
  all.forEach((message) => {
    if (message && !message.pending && message.xmppId) {
      echoedClientIds.add(String(message.xmppId));
    }
  });

  const byId = new Map<string, IMessage>();
  all.forEach((message) => {
    if (!message) return;
    if (message.pending && echoedClientIds.has(String(message.id))) return;
    const key = getMessageKey(message);
    if (!key) return;
    const enriched = enrichMessageAuthor(message, usersSet);
    // `activeMessage` is a purely client-side UI flag (stamped by the
    // setActiveMessage reducer to mark which message's thread is open) -
    // it is never present on a wire-parsed stanza. A background merge
    // (history catch-up, preload) can deliver a fresh copy of the same
    // message id with no `activeMessage` field at all; a blind overwrite
    // here would silently clear the flag and kick the user out of an
    // open thread. Carry it forward from whichever copy already has it.
    const previous = byId.get(key);
    if (previous?.activeMessage && enriched.activeMessage === undefined) {
      enriched.activeMessage = true;
    }
    byId.set(key, enriched);
  });

  // A persisted local call-log fallback (id "calllog-<callId>") and its
  // server MAM copy have different ids, so the byId pass keeps both - collapse
  // them into the canonical server entry.
  const merged = [...byId.values()];
  if (!isSortedByMessageOrder(merged)) {
    merged.sort(compareMessageOrder);
  }
  return collapseCallLogDuplicates(merged);
};

const normalizeDelimiterPosition = (
  messages: IMessage[],
  lastViewedTimestamp?: number
): IMessage[] => {
  const list = (messages || []).filter((msg) => msg?.id !== 'delimiter-new');
  const lastViewed = getTimestampFromUnknown(lastViewedTimestamp);

  if (lastViewed <= 0 || list.length === 0) {
    return list;
  }

  const firstUnreadIndex = list.findIndex((msg) => {
    if (!msg || msg.pending) return false;
    const ts = getMessageTimestampValue(msg);
    return ts > lastViewed;
  });

  if (firstUnreadIndex === -1) {
    return list;
  }

  const delimiter: IMessage = {
    id: 'delimiter-new',
    body: 'New Messages',
    date: new Date(lastViewed).toISOString(),
    roomJid: list[firstUnreadIndex]?.roomJid || '',
    user: {
      id: 'system',
      name: 'system',
      token: '',
      refreshToken: '',
    },
  } as IMessage;

  list.splice(firstUnreadIndex, 0, delimiter);
  return list;
};

export const addRoomViaApi = createAsyncThunk(
  'roomMessages/addRoomViaApi',
  async (
    { room, xmpp: _xmpp }: { room: IRoom; xmpp: XmppClient },
    { dispatch }
  ) => {
    if (!room || !room.jid) return;
    dispatch(roomsStore.actions.addRoomFromApi({ room }));
  }
);

// Shared by the updateRoom and updateRooms reducers so the batched form
// behaves identically to dispatching updateRoom once per room.
const applyRoomUpdate = (
  state: RoomMessagesState,
  jid: string,
  updates: Partial<IRoom>
) => {
  const existingRoom = state.rooms[jid];
  if (!existingRoom) return;

  const merged: IRoom = {
    ...existingRoom,
    ...updates,
  };

  if (typeof updates.usersCnt === 'number') {
    const incoming = updates.usersCnt;
    const newMembers = Array.isArray(updates.members)
      ? updates.members
      : existingRoom.members;
    const floor = Array.isArray(newMembers) ? newMembers.length : 0;
    merged.usersCnt = Math.max(incoming, floor);
  } else if (Array.isArray(updates.members)) {
    merged.usersCnt = updates.members.length;
  }
  state.rooms[jid] = merged;
};

const roomsStore = createSlice({
  name: 'roomMessages',
  initialState,
  reducers: {
    addRoom(state, action: PayloadAction<{ roomData: IRoom }>) {
      const { roomData } = action.payload;
      if (!isValidRoomJid(roomData?.jid)) return;
      const existing = state.rooms[roomData.jid];
      const incomingMessages = Array.isArray(roomData.messages)
        ? roomData.messages
        : [];
      const existingMessages = Array.isArray(existing?.messages)
        ? existing!.messages
        : [];
      state.rooms[roomData.jid] = {
        ...existing,
        ...roomData,
        title: roomData.title || existing?.title || roomData.title,
        usersCnt: (() => {
          if (Array.isArray(roomData.members)) {
            return roomData.members.length;
          }
          if (typeof roomData.usersCnt === 'number' && roomData.usersCnt > 0) {
            return roomData.usersCnt;
          }
          return existing?.usersCnt ?? roomData.usersCnt;
        })(),
        icon: roomData.icon ?? existing?.icon,
        messages:
          existingMessages.length > 0 ? existingMessages : incomingMessages,
        // See addRoomFromApi's identical line - same reasoning: a seed
        // used only while `messages` is empty, so take the freshest value
        // but never let a `roomData` with no `lastMessage` erase one that
        // was already there.
        lastMessage: roomData.lastMessage ?? existing?.lastMessage,
        unreadMessages: existing?.unreadMessages ?? roomData.unreadMessages ?? 0,
        lastViewedTimestamp:
          existing?.lastViewedTimestamp ?? roomData.lastViewedTimestamp ?? 0,
        unreadBaselineTimestamp:
          firstPositiveTimestamp(
            existing?.unreadBaselineTimestamp,
            existing?.lastViewedTimestamp,
            roomData.unreadBaselineTimestamp,
            roomData.lastViewedTimestamp
          ) ||
          resolveInitialUnreadBaseline(
            existingMessages.length > 0 ? existingMessages : incomingMessages
          ),
        composingList: existing?.composingList ?? roomData.composingList,
        composing: existing?.composing ?? roomData.composing,
        unreadCapped:
          existing?.unreadCapped ?? roomData.unreadCapped ?? false,
        historyPreloadState:
          existing?.historyPreloadState ??
          roomData.historyPreloadState ??
          'idle',
        messageStats: existing?.messageStats ?? roomData.messageStats,
        historyComplete:
          existing?.historyComplete ?? roomData.historyComplete,
      };
    },
    deleteRoom(state, action: PayloadAction<{ jid: string }>) {
      const { jid } = action.payload;
      if (state.rooms[jid]) {
        delete state.rooms[jid];
      }
      if (state.drafts?.[jid] !== undefined) {
        delete state.drafts[jid];
      }
    },
    /**
     * Stores (or clears, when `text` is empty) one room's unsent composer
     * text. The composer debounces these, so this runs on a pause in typing
     * rather than per keystroke.
     */
    setRoomDraft(state, action: PayloadAction<{ jid: string; text: string }>) {
      const jid = action.payload?.jid;
      if (!isValidRoomJid(jid)) return;
      if (!state.drafts) state.drafts = {};

      const text = String(action.payload?.text ?? '').slice(0, MAX_DRAFT_LENGTH);

      if (!text) {
        if (state.drafts[jid] !== undefined) delete state.drafts[jid];
        return;
      }
      // Unchanged text must not produce a new state object: the composer's
      // save path can legitimately re-submit the same string (a restore, a
      // re-render), and every state change here costs a persist write of
      // the whole rooms slice.
      if (state.drafts[jid] === text) return;

      // Key insertion order IS the recency order the cap below trims by, so
      // re-insert the room just typed in as the newest entry.
      delete state.drafts[jid];
      state.drafts[jid] = text;

      const keys = Object.keys(state.drafts);
      if (keys.length > MAX_PERSISTED_DRAFTS) {
        keys
          .slice(0, keys.length - MAX_PERSISTED_DRAFTS)
          .forEach((stale) => delete state.drafts[stale]);
      }
    },
    /** Drops one room's draft: what sending a message does. */
    clearRoomDraft(state, action: PayloadAction<{ jid: string }>) {
      const jid = action.payload?.jid;
      if (!jid || !state.drafts) return;
      if (state.drafts[jid] !== undefined) delete state.drafts[jid];
    },
    updateRoom(
      state,
      action: PayloadAction<{ jid: string; updates: Partial<IRoom> }>
    ) {
      const { jid, updates } = action.payload;
      applyRoomUpdate(state, jid, updates);
    },
    // Batched form of updateRoom - one dispatch (and one Redux notification)
    // for many rooms instead of a dispatch-per-room loop. Used by
    // stanzaHandlers' onUserUpdate, which can touch every room a user is a
    // member of from a single headline stanza.
    updateRooms(
      state,
      action: PayloadAction<Array<{ jid: string; updates: Partial<IRoom> }>>
    ) {
      for (const { jid, updates } of action.payload) {
        applyRoomUpdate(state, jid, updates);
      }
    },
    setRoomMessages(
      state,
      action: PayloadAction<{ roomJID: string; messages: IMessage[] }>
    ) {
      const { roomJID, messages } = action.payload;
      if (state.rooms[roomJID]) {
        const merged = mergeRoomMessages(
          stripCallSignals(state.rooms[roomJID].messages),
          stripCallSignals(messages),
          state.usersSet
        );
        const effectiveLastViewed =
          state.activeRoomJID === roomJID
            ? 0
            : state.rooms[roomJID].lastViewedTimestamp;
        state.rooms[roomJID].messages = normalizeDelimiterPosition(
          merged,
          effectiveLastViewed
        );
      }
    },
    replaceRoomMessages(
      state,
      action: PayloadAction<{ roomJID: string; messages: IMessage[] }>
    ) {
      const { roomJID, messages } = action.payload;
      if (state.rooms[roomJID]) {
        const enriched = stripCallSignals(messages).map((message) =>
          enrichMessageAuthor(message, state.usersSet)
        );
        const sorted = isSortedByMessageOrder(enriched)
          ? enriched
          : [...enriched].sort(compareMessageOrder);
        const effectiveLastViewed =
          state.activeRoomJID === roomJID
            ? 0
            : state.rooms[roomJID].lastViewedTimestamp;
        state.rooms[roomJID].messages = normalizeDelimiterPosition(
          sorted,
          effectiveLastViewed
        );
      }
    },
    deleteRoomMessage(
      state,
      action: PayloadAction<{ roomJID: string; messageId: string }>
    ) {
      const { roomJID, messageId } = action.payload;
      if (state.rooms[roomJID]) {
        // Tombstone the message instead of removing it so the bubble can render
        // a "deleted" placeholder and ordering / replies / quoting stay intact.
        state.rooms[roomJID].messages = state.rooms[roomJID].messages.map(
          (message) =>
            message.id === messageId
              ? {
                  ...message,
                  isDeleted: true,
                  body: '',
                  isMediafile: 'false',
                  location: undefined,
                  locationPreview: undefined,
                  mimetype: undefined,
                  fileName: undefined,
                  attachments: undefined,
                  reaction: undefined,
                }
              : message
        );
      }
    },
    /**
     * Hard removal, unlike `deleteRoomMessage`'s tombstone. For optimistic
     * messages that never made it onto the wire: a failed upload has no
     * server-side counterpart, so leaving a "deleted message" placeholder
     * behind would be a lie - and leaving it pending is worse, it sits at
     * "sending..." forever.
     */
    removeRoomMessage(
      state,
      action: PayloadAction<{ roomJID: string; messageId: string }>
    ) {
      const { roomJID, messageId } = action.payload;
      if (state.rooms[roomJID]) {
        state.rooms[roomJID].messages = state.rooms[roomJID].messages.filter(
          (message) => message.id !== messageId
        );
      }
    },
    setReactions: (
      state,
      action: PayloadAction<ReactionAction | undefined>
    ) => {
      const { roomJID, messageId, reactions, from, data } = action.payload;

      if (state.rooms[roomJID]) {
        state.rooms[roomJID].messages.map((message) => {
          if (message.id === messageId) {
            if (from) {
              if (!message.reaction) {
                message.reaction = {};
              }

              const fromId = from.split('@')[0];
              if (reactions.length === 0) {
                delete message.reaction[fromId];
              } else {
                message.reaction[fromId] = {
                  emoji: reactions,
                  data: data,
                };
              }
            }
          }
        });
      }
    },
    // The send-failure watchdog gave up waiting for the MUC echo. This only
    // flips a DISPLAY flag - the message keeps its id and stays `pending`,
    // so a late echo still reconciles onto the same entry (addRoomMessage
    // clears `failed` there) instead of arriving as a second message.
    setMessageSendFailed(
      state,
      action: PayloadAction<{ roomJID: string; messageId: string }>
    ) {
      const { roomJID, messageId } = action.payload;
      const message = state.rooms[roomJID]?.messages?.find(
        (msg) => msg.id === messageId || msg.xmppId === messageId
      );
      // No entry means the user deleted it, or the echo already collapsed
      // it into the server copy - either way there is nothing to fail.
      if (!message || message.pending === false) return;
      message.failed = true;
    },
    // Retry: put the message back into the sending state under its ORIGINAL
    // id, so the retry send and any late echo of the first attempt land on
    // the same entry.
    setMessageSendRetrying(
      state,
      action: PayloadAction<{ roomJID: string; messageId: string }>
    ) {
      const { roomJID, messageId } = action.payload;
      const message = state.rooms[roomJID]?.messages?.find(
        (msg) => msg.id === messageId || msg.xmppId === messageId
      );
      if (!message) return;
      message.failed = false;
      message.pending = true;
    },
    setEditAction: (state, action: PayloadAction<EditAction | undefined>) => {
      const { isEdit } = action.payload;
      if (isEdit) {
        state.editAction = action.payload;
      } else {
        state.editAction = {
          isEdit: false,
          roomJid: '',
          messageId: '',
          text: '',
        };
      }
    },
    // Shared by two callers that must agree on the result: the optimistic
    // apply in useSendMessage (fired the moment the author confirms an
    // edit) and the server echo (onEditMessage in stanzaHandlers.ts). Both
    // just set body/isEdited unconditionally, which is what makes a
    // same-text echo a no-op and a different-text echo (another client's
    // edit won the race) simply win - there is no "already edited" branch
    // to get out of sync.
    editRoomMessage(
      state,
      action: PayloadAction<{
        roomJID: string;
        messageId: string;
        text: string;
        // Defaults to true (a genuine edit). The optimistic-apply rollback
        // in useSendMessage passes the pre-edit value back through here so
        // a message that was already edited before this attempt doesn't
        // lose its "edited" label when the failed attempt is undone.
        isEdited?: boolean;
      }>
    ) {
      const { roomJID, messageId, text, isEdited = true } = action.payload;
      const message = state.rooms[roomJID]?.messages.find(
        (msg) => msg.id === messageId
      );
      if (!message) return;
      message.body = text;
      message.isEdited = isEdited;
      // The cached translation was computed for the OLD body, and the edit
      // relay (editMessage.xmpp.ts) carries no re-translation - so a stale
      // entry would render as if it were a translation of text that no
      // longer exists. `translations` is deliberately not persisted and
      // re-syncs from the server on room open (see PERSISTED_MESSAGE_FIELDS
      // in roomStore/index.ts), so dropping it here just means the reader
      // sees the plain (correct) new body until the next resync instead of
      // a mismatched one.
      delete message.translations;
    },
    // Caches a single on-demand translation (manual mode's "Translate"
    // click, see MessageTranslate.tsx) onto the message it belongs to,
    // keyed by whatever locale string the translate service echoed back
    // (a full regional tag like "fr-CA", matching what getDataFromXml
    // already keys server-attached translations by). Landing it in the
    // store rather than component state means:
    //  - a second click on the same message is free, even after the
    //    bubble unmounted and remounted (long rooms remount bubbles on
    //    scroll, wiping any local useState);
    //  - 'auto' mode (useMessageTranslation) sees it too, since it just
    //    reads message.translations - no separate cache to keep in sync.
    // Deliberately not persisted (see PERSISTED_MESSAGE_FIELDS in
    // roomStore/index.ts) for the same reason editRoomMessage above drops
    // `translations` on an edit: a stale fetched entry is worse than
    // re-fetching, and it re-syncs from the server on room open anyway.
    setMessageTranslation(
      state,
      action: PayloadAction<{
        roomJID: string;
        messageId: string;
        locale: string;
        entry: Translation;
      }>
    ) {
      const { roomJID, messageId, locale, entry } = action.payload;
      const message = state.rooms[roomJID]?.messages.find(
        (msg) => msg.id === messageId
      );
      if (!message) return;
      if (!message.translations) message.translations = {};
      message.translations[locale] = entry;
    },
    addRoomMessage(state, action: PayloadAction<AddRoomMessageAction>) {
      const { roomJID, message, start } = action.payload;

      if (!message?.body) return;
      // Call signaling broadcasts ("call-token", "call-state", etc.)
      // sometimes slip past the live XMPP filter (e.g. MAM history,
      // mucsub catch-up) - drop them here so they never land in the
      // transcript or the sidebar "last message" preview.
      if (isCallSignalMessage(message)) return;

      const roomMessages = state.rooms[roomJID]?.messages;

      const roomsExist = Object.keys(state.rooms).length > 0;

      const roomExist = !!state?.rooms[roomJID];
      if (!roomsExist || !roomExist) {
        return;
      }

      if (!roomMessages) {
        state.rooms[roomJID].messages = [];
      }

      // Collapse multiple call-state events for the same call into a single
      // log entry. Sources: the client-side fallback written at hangup (id
      // "calllog-<callId>", exists only locally) and the server broadcast(s),
      // which can fire once per participant leaving (earlier ones carry a
      // partial durationMs). Rules:
      //  - the SERVER copy is canonical for identity (id/date/xmppId): its
      //    archive id is what MAM and the catch-up anchor return later, so
      //    keeping a local "calllog-" id around breaks anchor matching and
      //    duplicates the entry on the next history merge;
      //  - the LARGEST duration wins for display, so a 2-minute call doesn't
      //    render as "2 sec".
      const incomingCallLog = (message as IMessage).callLog;
      if (incomingCallLog?.callId) {
        const list = state.rooms[roomJID].messages;
        const existingCallIdx = list.findIndex(
          (msg) => msg.callLog?.callId === incomingCallLog.callId
        );
        if (existingCallIdx !== -1) {
          const existing = list[existingCallIdx];
          const merged = mergeCallLogEntries(existing, message as IMessage);
          if (merged !== existing) {
            list[existingCallIdx] = merged;
          }
          return;
        }
      }

      const existingIndex = roomMessages.findIndex(
        (msg) =>
          msg.id === message.id ||
          (message.xmppId && msg.id === message.xmppId) ||
          (msg.xmppId && msg.xmppId === message.id)
      );
      if (existingIndex !== -1) {
        // `failed: false` alongside `pending: false`: the echo IS the
        // server's acceptance, and it can arrive after the send-failure
        // watchdog already gave up (slow network, a long message behind a
        // burst). The server's word always wins over our timeout, and
        // because the echo carries the same client id it lands on this
        // existing entry - the sender sees one message that flips from
        // "not delivered" back to sent, never a second copy.
        roomMessages[existingIndex] = deepMerge(
          { ...roomMessages[existingIndex] },
          { ...message, pending: false, failed: false }
        );
        return;
      }

      // Run the full author-resolution pipeline so newly-arrived messages honor
      // the sender's <data fullName>/senderFirstName/senderLastName attrs from the
      // stanza (bots + regular users both emit those). Previously we only used
      // createUserNameFromSetUser here, which returns the literal "Deleted User"
      // string the instant usersSet doesn't yet know the sender - precisely the
      // case for live bot messages that arrive before usersSet is hydrated.
      const enriched = enrichMessageAuthor(
        message as IMessage,
        state.usersSet
      );
      const updMessage = {
        ...enriched,
        user: {
          // Keep photoURL etc. from the incoming message, but use enriched `name`.
          ...message.user,
          ...enriched.user,
        },
      };

      if (roomMessages.length === 0 || start) {
        const index = roomMessages.findIndex(
          (msg) => msg.id === message.xmppId || msg.id === message.id
        );
        if (index !== -1) {
          roomMessages[index] = {
            ...updMessage,
            id: updMessage.id,
            pending: false,
            failed: false,
          };
        } else {
          roomMessages.unshift(updMessage);
        }
      } else {
        const lastViewedTimestamp = state.rooms[roomJID].lastViewedTimestamp
          ? new Date(state.rooms[roomJID].lastViewedTimestamp)
          : null;

        insertMessageWithDelimiter(
          roomMessages,
          updMessage,
          lastViewedTimestamp
        );
      }

      // insertMessageWithDelimiter already places the message in order, so a
      // full O(n log n) re-sort is only needed when something is actually out
      // of order (rare: e.g. server echo with a corrected archive id).
      const currentMessages = state.rooms[roomJID].messages;
      const ordered = isSortedByMessageOrder(currentMessages)
        ? currentMessages
        : [...currentMessages].sort(compareMessageOrder);
      state.rooms[roomJID].messages = normalizeDelimiterPosition(
        ordered,
        state.activeRoomJID === roomJID
          ? 0
          : state.rooms[roomJID].lastViewedTimestamp
      );
    },
    deleteAllRooms(state) {
      state.rooms = {};
      state.drafts = {};
    },
    insertUsers(state, action: PayloadAction<{ newUsers: RoomMember[] }>) {
      const { newUsers } = action.payload;
      if (!newUsers || newUsers.length === 0) return;

      // Detect whether this batch actually changes any display name before
      // walking every message of every room below (that walk is
      // O(rooms x messages) through the Immer draft and insertUsers fires
      // once per stanza on the hot path). If every user is already cached
      // with the same name fields, messages were already enriched on insert
      // and the walk can't change anything.
      let hasNameChanges = false;
      newUsers.forEach((user) => {
        const existing = state.usersSet[user.xmppUsername];
        if (
          !existing ||
          existing.firstName !== user.firstName ||
          existing.lastName !== user.lastName
        ) {
          hasNameChanges = true;
        }
        state.usersSet[user.xmppUsername] = user;
      });
      if (!hasNameChanges) return;

      const updatedUsernames = new Set(newUsers.map((u) => u.xmppUsername));
      Object.values(state.rooms).forEach((room) => {
        room.messages.forEach((message) => {
          const msgUserLocal = message.user?.id?.split('@')[0] ?? '';
          const rawId = message.user?.id ?? '';
          const matched =
            (msgUserLocal && state.usersSet[msgUserLocal]) ||
            (rawId && state.usersSet[rawId]) ||
            null;

          // Upgrade the rendered name when:
          //  (a) this is one of the newly-inserted users, OR
          //  (b) the message was previously stamped with "Deleted User" and we now
          //      have an identity we can use (either from usersSet or from in-message
          //      <data> fullName fields) - fixes the sticky-"Deleted User" bug users
          //      hit after an ai-service bot restart.
          const stale = String(message.user?.name || '') === 'Deleted User';
          const isTargetedUpdate =
            updatedUsernames.has(msgUserLocal) || updatedUsernames.has(rawId);
          if (!isTargetedUpdate && !stale) return;

          if (matched) {
            const upgraded =
              createUserNameFromSetUser(state.usersSet, msgUserLocal) ||
              createUserNameFromSetUser(state.usersSet, rawId);
            if (upgraded && upgraded !== 'Deleted User') {
              message.user = { ...message.user, name: upgraded };
              return;
            }
          }
          if (stale) {
            // Try the in-message <data> fullName fields as a last resort so old
            // messages that landed before usersSet hydrated stop displaying
            // "Deleted User" even when no API lookup ever succeeds.
            const dataFull = String((message as any)?.fullName || '').trim();
            const dataFirst = String((message as any)?.senderFirstName || '').trim();
            const dataLast = String((message as any)?.senderLastName || '').trim();
            const fromData = dataFull || `${dataFirst} ${dataLast}`.trim();
            if (fromData) {
              message.user = { ...message.user, name: fromData };
            }
          }
        });
      });
    },
    setComposing(
      state,
      action: PayloadAction<{
        chatJID: string;
        composing: boolean;
        composingList?: string[];
      }>
    ) {
      const { chatJID, composing, composingList } = action.payload;
      if (!state.rooms[chatJID]) {
        return;
      }
      state.rooms[chatJID].composing = composing;
      state.rooms[chatJID].composingList = composingList;
    },
    setIsLoading: (
      state,
      action: PayloadAction<{
        chatJID?: string;
        loading: boolean;
        loadingText?: string;
      }>
    ) => {
      const { chatJID, loading, loadingText } = action.payload;
      if (chatJID && state.rooms?.[chatJID]) {
        state.rooms[chatJID].isLoading = loading;
      }
      if (!chatJID) {
        state.isLoading = loading;
      }
      if (Object.prototype.hasOwnProperty.call(action.payload, 'loadingText')) {
        state.loadingText = loadingText;
      }
    },
    setLastViewedTimestamp: (
      state,
      action: PayloadAction<{ chatJID: string; timestamp: number }>
    ) => {
      const { chatJID, timestamp } = action.payload;
      if (state.rooms[chatJID]) {
        const previousLastViewed = getTimestampFromUnknown(
          state.rooms[chatJID].lastViewedTimestamp
        );
        const baseline = getTimestampFromUnknown(
          state.rooms[chatJID].unreadBaselineTimestamp
        );
        const normalizedTimestamp = getTimestampFromUnknown(timestamp);
        state.rooms[chatJID].lastViewedTimestamp = normalizedTimestamp;
        const isEnteringActive = state.activeRoomJID === chatJID;
        if (isEnteringActive) {
          state.rooms[chatJID].unreadMessages = 0;
        }
        const delimiterCutoff = isEnteringActive
          ? (previousLastViewed > 0 ? previousLastViewed : baseline)
          : normalizedTimestamp;
        state.rooms[chatJID].messages = normalizeDelimiterPosition(
          state.rooms[chatJID].messages,
          delimiterCutoff
        );
        state.rooms[chatJID].unreadCapped = false;
      }
    },
    setRoomRole: (
      state,
      action: PayloadAction<{ chatJID: string; role: string }>
    ) => {
      const { chatJID, role } = action.payload;
      if (state.rooms[chatJID]) {
        state.rooms[chatJID].role = role;
      }
    },
    setRoomNoMessages: (
      state,
      action: PayloadAction<{ value: boolean; chatJID?: string }>
    ) => {
      const { value, chatJID } = action.payload;
      if (chatJID) {
        state.rooms[chatJID].noMessages = value;
      }
    },
    setCurrentRoom: (
      state,
      action: PayloadAction<{ roomJID: string | null }>
    ) => {
      const { roomJID } = action.payload;
      state.activeRoomJID = roomJID;
    },
    setMemberOnline: (
      state,
      action: PayloadAction<{ roomJID: string; xmppUsername: string }>
    ) => {
      const { roomJID, xmppUsername } = action.payload;
      if (!roomJID || !xmppUsername) return;
      const list =
        state.presenceByRoom[roomJID] ?? (state.presenceByRoom[roomJID] = []);
      if (!list.includes(xmppUsername)) list.push(xmppUsername);
    },
    setMemberOffline: (
      state,
      action: PayloadAction<{ roomJID: string; xmppUsername: string }>
    ) => {
      const { roomJID, xmppUsername } = action.payload;
      const list = state.presenceByRoom[roomJID];
      if (list) {
        state.presenceByRoom[roomJID] = list.filter((u) => u !== xmppUsername);
      }
    },
    setChatUiVisible: (state, action: PayloadAction<boolean>) => {
      state.isChatUiVisible = action.payload;
    },
    setLogoutState: (state) => {
      state.rooms = {};
      state.activeRoomJID = null;
      state.isChatUiVisible = false;
      state.isLoading = false;
      state.usersSet = {};
      state.presenceByRoom = {};
      // Half-typed messages are user content: logging out must not leave
      // them behind for whoever logs in next.
      state.drafts = {};
    },
    setActiveMessage: (
      state,
      action: PayloadAction<{ id: string; chatJID: string }>
    ) => {
      const { id, chatJID } = action.payload;

      state.rooms[chatJID].messages.map((message) => {
        if (message.id === id) {
          message.activeMessage = true;
        } else {
          message.activeMessage = false;
        }
      });
    },
    setCloseActiveMessage: (
      state,
      action: PayloadAction<{ chatJID: string }>
    ) => {
      const { chatJID } = action.payload;

      state.rooms[chatJID].messages.map((message) => {
        message.activeMessage = false;
      });
    },
    addRoomFromApi: (state, action: PayloadAction<{ room: IRoom }>) => {
      const { room } = action.payload;
      if (!isValidRoomJid(room?.jid)) return;
      const existing = state.rooms[room.jid];
      const incomingMessages = Array.isArray(room.messages)
        ? room.messages
        : [];
      const existingMessages = Array.isArray(existing?.messages)
        ? existing!.messages
        : [];
      state.rooms[room.jid] = {
        ...existing,
        ...room,
        title: room.title || existing?.title || room.title,
        usersCnt: (() => {
          if (Array.isArray(room.members)) {
            return room.members.length;
          }
          if (typeof room.usersCnt === 'number' && room.usersCnt > 0) {
            return room.usersCnt;
          }
          return existing?.usersCnt ?? room.usersCnt;
        })(),
        icon: room.icon ?? existing?.icon,
        messages:
          existingMessages.length > 0 ? existingMessages : incomingMessages,
        // A seed for the room-list preview, used only while `messages` is
        // empty (see ChatRoomItem) - so it is safe to just take the
        // freshest API value here. Falling back to `existing?.lastMessage`
        // (rather than letting `...room` write `undefined` over it) matters
        // because this reducer runs on every /chats/my refresh: a refresh
        // that doesn't carry `lastMessage` (prod, or a stripped-down
        // response) must not erase one a previous, richer response already
        // set.
        lastMessage: room.lastMessage ?? existing?.lastMessage,
        unreadMessages: existing?.unreadMessages ?? room.unreadMessages ?? 0,
        lastViewedTimestamp:
          existing?.lastViewedTimestamp ?? room.lastViewedTimestamp ?? 0,
        unreadBaselineTimestamp:
          firstPositiveTimestamp(
            existing?.unreadBaselineTimestamp,
            existing?.lastViewedTimestamp,
            room.unreadBaselineTimestamp,
            room.lastViewedTimestamp
          ) ||
          resolveInitialUnreadBaseline(
            existingMessages.length > 0 ? existingMessages : incomingMessages
          ),
        composingList: existing?.composingList ?? room.composingList,
        composing: existing?.composing ?? room.composing,
        unreadCapped: existing?.unreadCapped ?? room.unreadCapped ?? false,
        historyPreloadState:
          existing?.historyPreloadState ?? room.historyPreloadState ?? 'idle',
        messageStats: existing?.messageStats ?? room.messageStats,
        historyComplete: existing?.historyComplete ?? room.historyComplete,
      };
    },
    applyRoomsPreloadBatch: (
      state,
      action: PayloadAction<{ rooms: PreloadRoomUpdate[] }>
    ) => {
      const { rooms } = action.payload;
      if (!rooms?.length) return;

      rooms.forEach((update) => {
        if (!isValidRoomJid(update?.jid)) return;
        const room = state.rooms[update.jid];
        // Defensive: a corrupt rehydration can leave non-object entries here
        // (e.g. an array with stringified props). Mutating them via Immer
        // throws "Immer only supports setting array indices and the 'length'
        // property" which then nukes the entire history scheduler. Skip
        // anything that isn't a plain room object.
        if (!room || typeof room !== 'object' || Array.isArray(room)) return;

        if (typeof update.historyPreloadState !== 'undefined') {
          room.historyPreloadState = update.historyPreloadState;
        }

        if (typeof update.unreadCapped !== 'undefined') {
          room.unreadCapped = update.unreadCapped;
        }

        if (update.messages) {
          const merged = mergeRoomMessages(
            Array.isArray(room.messages) ? room.messages : [],
            update.messages,
            state.usersSet
          );
          room.messages = normalizeDelimiterPosition(
            merged,
            state.activeRoomJID === update.jid ? 0 : room.lastViewedTimestamp
          );
        }
      });
    },
    updateUsersSet: (state, action: PayloadAction<{ rooms: ApiRoom[] }>) => {
      const { rooms } = action.payload;
      state.usersSet = extractUniqueMembersFromRooms(rooms).object;
    },
    setOpenReportModal: (state, action: PayloadAction<{ isOpen: boolean }>) => {
      if (!state.reportRoom) {
        state.reportRoom = { isOpen: false };
      }
      state.reportRoom.isOpen = action.payload.isOpen;
    },
    setPushSubscriptionStatus: (
      state,
      action: PayloadAction<{ jid: string; status: 'pending' | 'subscribed' | 'error' | 'blocked' }>
    ) => {
      const { jid, status } = action.payload;
      const subscribedRooms = getNormalizedSubscribedRooms(state.subscribedRooms);

      if (subscribedRooms !== state.subscribedRooms) {
        state.subscribedRooms = subscribedRooms;
      }

      state.pushSubscriptionStatus[jid] = status;
      if (status === 'subscribed') {
        if (!subscribedRooms.includes(jid)) {
          subscribedRooms.push(jid);
        }
      } else if (status === 'blocked' || status === 'error') {
        state.subscribedRooms = subscribedRooms.filter((id) => id !== jid);
      }
    },
    clearPushSubscriptions: (state) => {
      state.subscribedRooms = [];
      state.pushSubscriptionStatus = {};
    },
    // Sets the caller's own mute preference for one room. `undefined` clears
    // the field back to "unsupported" instead of writing `false` - used to
    // roll back an optimistic toggle that started from a room the backend
    // had never reported a `muted` value for (see useRoomMute).
    setRoomMuted: (
      state,
      action: PayloadAction<{ jid: string; muted: boolean | undefined }>
    ) => {
      const { jid, muted } = action.payload;
      const room = state.rooms[jid];
      if (!room) return;
      if (muted === undefined) {
        delete room.muted;
      } else {
        room.muted = muted;
      }
    },
  },
});

function deepMerge(target: any, source: any): any {
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const countNewerMessages = (
  messages: IMessage[],
  timestamp: number
): number => {
  const normalizedTimestamp = getTimestampFromUnknown(timestamp);
  if (normalizedTimestamp <= 0) return 0;

  return messages.filter((message) => {
    if (
      !message ||
      message.id === 'delimiter-new' ||
      message.pending ||
      String((message as any)?.isSystemMessage || '') === 'true'
    ) {
      return false;
    }
    const ts = getMessageTimestampValue(message);
    return ts > normalizedTimestamp;
  }).length;
};

export const getLastMessageTimestamp = (
  state: RoomMessagesState,
  jid: string
): string | null => {
  const room = state.rooms[jid];
  if (!room || room.messages.length === 0) {
    return null;
  }
  const lastMessage = room.messages[room.messages.length - 1];
  return lastMessage.id;
};

export const {
  addRoom,
  deleteAllRooms,
  setRoomMessages,
  replaceRoomMessages,
  addRoomMessage,
  deleteRoomMessage,
  removeRoomMessage,
  setEditAction,
  setMessageSendFailed,
  setMessageSendRetrying,
  editRoomMessage,
  setMessageTranslation,
  setComposing,
  setIsLoading,
  setLastViewedTimestamp,
  setRoomNoMessages,
  setCurrentRoom,
  setMemberOnline,
  setMemberOffline,
  setChatUiVisible,
  setRoomRole,
  setReactions,
  setLogoutState,
  setActiveMessage,
  setCloseActiveMessage,
  deleteRoom,
  updateRoom,
  updateRooms,
  updateUsersSet,
  setOpenReportModal,
  insertUsers,
  setPushSubscriptionStatus,
  clearPushSubscriptions,
  applyRoomsPreloadBatch,
  setRoomDraft,
  clearRoomDraft,
  setRoomMuted,
} = roomsStore.actions;

export default roomsStore.reducer;

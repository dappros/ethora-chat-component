import {
  configureStore,
  combineReducers,
  Reducer,
  AnyAction,
} from '@reduxjs/toolkit';
import chatSettingsReducer from './chatSettingsSlice';
import roomsSlice from './roomsSlice';
import roomHeapSlice from './roomHeapSlice';
import callSlice from './callSlice';
import { IMessage, IRoom } from '../types/types';
import { unreadMiddleware } from './Middleware/unreadMidlleware';
import { storage } from './storage';
import { persistReducer, persistStore } from 'redux-persist';
import { createTransform } from 'redux-persist';
import { newMessageMidlleware } from './Middleware/newMessageMidlleware';
import { logoutMiddleware } from './Middleware/logoutMiddleware';
import { encryptTransform } from 'redux-persist-transform-encrypt';
import { reactionsMiddleware } from './Middleware/reactionsMiddleware';
import { ETHORA_CHAT_COMPONENT_VERSION } from '../version';
import { sanitizeUserForPersistentStorage } from '../helpers/authStorage';
import { ethoraLogger } from '../helpers/ethoraLogger';

const debugMiddleware = (storeAPI) => (next) => (action) => {
  if (typeof action !== 'object' || action === null) {
    console.error('Non-plain object action detected:', action);
    console.error('Action type:', typeof action);
    console.error('Action constructor:', action?.constructor?.name);
    console.error('Stack trace:', new Error().stack);
    throw new Error(
      'Actions must be plain objects. Received: ' + typeof action
    );
  }

  if (!action.type) {
    console.error('Action missing type property:', action);
    console.error('Stack trace:', new Error().stack);
    throw new Error('Actions must have a type property');
  }

  if (
    (action.type && action.type.endsWith('/pending')) ||
    (action.type && action.type.endsWith('/fulfilled')) ||
    (action.type && action.type.endsWith('/rejected'))
  ) {
    if (!action.payload && !action.meta && !action.error) {
      console.warn('Thunk action missing expected properties:', action);
    }
  }

  return next(action);
};

// Body strings the server uses for call signaling broadcasts. These
// should never reach the transcript / sidebar preview — keep this set in
// sync with the same constant in roomsSlice.ts.
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

const normalizeMessageList = (messages: unknown): IMessage[] =>
  Array.isArray(messages)
    ? messages.filter((message): message is IMessage => {
        if (!message || typeof message !== 'object') return false;
        // Strip call-signal messages from rehydrated state — older
        // builds wrote them into the transcript before the live filter
        // existed, and they survive in encrypted persisted blobs.
        const body = String((message as any).body || '')
          .trim()
          .toLowerCase();
        if (body && CALL_SIGNAL_BODIES.has(body)) return false;
        return true;
      })
    : [];

// IMPORTANT: redux-persist applies transforms PER TOP-LEVEL KEY of the
// slice state - `transformer.in(state[key], key, state)` (see
// redux-persist/lib/createPersistoid.js). So for the rooms slice the
// transform receives the rooms MAP itself under key 'rooms', the usersSet
// under key 'usersSet', and so on - never the whole slice object. The old
// transforms here assumed whole-slice shape ({rooms: {...}}), read
// `.rooms` off the rooms map (undefined), capped an empty object, and
// spread the real, uncapped map straight through - which is why the
// 50-message cap never actually limited anything (persist:roomMessages
// was observed at ~7M chars), why every persist write serialized and
// AES-encrypted megabytes on the main thread, and where the legacy
// "slice keys leaked into the rooms map" corruption came from (the
// transform itself injected `rooms`/`activeRoomJID`/`usersSet` keys into
// the persisted value it returned). Everything below is key-aware.
export const sanitizeRoomsMap = (
  roomsMap: Record<string, any>
): Record<string, IRoom> => {
  if (!roomsMap || typeof roomsMap !== 'object') return {};

  return Object.fromEntries(
    Object.entries(roomsMap)
      .filter(([key, room]) => {
        // Strip non-JID keys (legacy persisted blobs from the broken
        // whole-slice transforms carry `rooms`/`activeRoomJID`/`usersSet`
        // keys inside the rooms map). Also drop arrays / non-objects
        // which crash Immer when reducers later mutate them as rooms.
        if (!key || typeof key !== 'string' || !key.includes('@')) return false;
        return room && typeof room === 'object' && !Array.isArray(room);
      })
      .map(([jid, room]: [string, IRoom]) => [
        jid,
        {
          ...room,
          messages: normalizeMessageList(room?.messages),
          composingList: Array.isArray((room as any)?.composingList)
            ? (room as any).composingList.filter(
                (item: unknown): item is string => typeof item === 'string'
              )
            : [],
        },
      ])
  );
};

const sanitizeRoomsSliceKey = (value: any, key: string | number) => {
  switch (key) {
    case 'rooms':
      return sanitizeRoomsMap(value);
    case 'usersSet':
    case 'pushSubscriptionStatus':
      return value && typeof value === 'object' ? value : {};
    case 'subscribedRooms':
      return Array.isArray(value)
        ? value.filter((room: unknown): room is string => typeof room === 'string')
        : [];
    default:
      return value;
  }
};

export const MAX_MESSAGES_PER_ROOM = 100;
export const MAX_PERSISTED_ROOMS = 100;
// Serialized size (UTF-16 code units - the same unit localStorage's
// ~5M-per-origin quota is measured in) the rooms snapshot may occupy
// BEFORE encryption. The encrypt transform inflates its input by roughly
// a third (AES + base64), and localStorage is shared with the settings
// slice and everything else on the origin, so 2.5M pre-encryption keeps
// the final write comfortably inside the quota.
export const PERSISTED_ROOMS_CHAR_BUDGET = 2_500_000;

export const getRoomActivityTimestamp = (room: IRoom): number =>
  room?.lastMessageTimestamp ||
  room?.messageStats?.lastMessageTimestamp ||
  room?.lastViewedTimestamp ||
  0;

// What a persisted message is FOR: instantly painting a recent transcript
// on reload before MAM catches up. That needs the fields the bubbles and
// sidebar previews actually read - nothing else. Everything outside this
// list is either wire-protocol junk that createMessageFromXml spreads
// onto every received message (senderFirstName/senderWalletAddress/
// tokenAmount/quickReplies/push/photo/fullName...), derived state that is
// recomputed on render (reply), or data that re-syncs from the server on
// room open (reaction via the reaction-history query, translations inside
// the MAM stanza). Whitelisting instead of blacklisting means new junk
// fields can never silently re-bloat the snapshot.
const PERSISTED_MESSAGE_FIELDS: (keyof IMessage)[] = [
  'id',
  'xmppId',
  'xmppFrom',
  'body',
  'date',
  'messageTimestampMs',
  'timestamp',
  'roomJid',
  'isSystemMessage',
  'isMediafile',
  'isDeleted',
  'isReply',
  'showInChannel',
  'mainMessage',
  'mimetype',
  'location',
  'locationPreview',
  'fileName',
  'originalName',
  'size',
  'langSource',
  'callLog',
];

// Optimistic sends spread the ENTIRE logged-in user into message.user
// (see useSendMessage.tsx) - that can include auth material and always
// includes fields the bubble never reads. Persist only what the UI uses.
const PERSISTED_MESSAGE_USER_FIELDS = [
  'id',
  'name',
  'firstName',
  'lastName',
  'profileImage',
  'photoURL',
  'xmppUsername',
] as const;

const pickDefined = <T extends object>(
  source: T,
  fields: readonly (keyof T)[]
): Partial<T> => {
  const result: Partial<T> = {};
  for (const field of fields) {
    if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return result;
};

export const compactMessageForPersist = (message: IMessage): IMessage => {
  const compact = pickDefined(message, PERSISTED_MESSAGE_FIELDS) as IMessage;
  if (message?.user && typeof message.user === 'object') {
    compact.user = pickDefined(
      message.user,
      PERSISTED_MESSAGE_USER_FIELDS as readonly (keyof IMessage['user'])[]
    ) as IMessage['user'];
  }
  return compact;
};

// Builds the snapshot that actually goes to storage. Three layers, each
// only doing work when the previous one wasn't enough:
//  1. compact every message to its whitelisted fields (the big win - the
//     wire-junk fields typically dominate a message's serialized size);
//  2. tail-cap messages per room and keep at most the most recently
//     active MAX_PERSISTED_ROOMS rooms;
//  3. if the result STILL exceeds the char budget (pathological case:
//     100 rooms x 100 long messages), evict message caches from the
//     least recently active rooms - keeping the room shell, so sidebar
//     previews/unread badges survive and only the transcript cache is
//     refetched from MAM on open. The active conversations the user
//     actually returns to keep their instant-paint cache.
export const optimizePersistedRooms = (
  rooms: Record<string, IRoom>,
  charBudget = PERSISTED_ROOMS_CHAR_BUDGET
): Record<string, IRoom> => {
  const roomEntries = Object.entries(rooms || {}) as [string, IRoom][];
  const mostActiveFirst = [...roomEntries].sort(
    ([, a], [, b]) => getRoomActivityTimestamp(b) - getRoomActivityTimestamp(a)
  );

  const compacted: [string, IRoom][] = mostActiveFirst
    .slice(0, MAX_PERSISTED_ROOMS)
    .map(([jid, room]) => {
      const messages = Array.isArray(room?.messages) ? room.messages : [];
      const tail =
        messages.length > MAX_MESSAGES_PER_ROOM
          ? messages.slice(-MAX_MESSAGES_PER_ROOM)
          : messages;
      return [jid, { ...room, messages: tail.map(compactMessageForPersist) }];
    });

  const sizes = compacted.map(([, room]) => JSON.stringify(room).length);
  let total = sizes.reduce((sum, size) => sum + size, 0);

  if (total > charBudget) {
    // Least recently active rooms are at the end of the array.
    for (let i = compacted.length - 1; i >= 0 && total > charBudget; i--) {
      const [jid, room] = compacted[i];
      if (!room.messages?.length) continue;
      const shell = { ...room, messages: [] as IMessage[] };
      total -= sizes[i];
      sizes[i] = JSON.stringify(shell).length;
      total += sizes[i];
      compacted[i] = [jid, shell];
    }
  }

  return Object.fromEntries(compacted);
};

// Exported for the per-key regression tests - the whole reason the old
// caps never worked is invisible without testing the transform through
// redux-persist's actual per-key calling convention.
export const limitMessagesTransform = createTransform<
  any,
  any,
  Record<string, any>,
  Record<string, any>
>(
  (inboundState, key) =>
    key === 'rooms' ? optimizePersistedRooms(inboundState) : inboundState,
  (outboundState, key) =>
    key === 'rooms' ? sanitizeRoomsMap(outboundState) : outboundState
);

const encryptor = encryptTransform({
  secretKey: 'hey-this-is-dappros',
  onError: (error) => {
    console.error('Encryption error:', error);
  },
});

// Same per-key bug as the rooms transforms: this used to check
// `inboundState?.user`, but for key 'user' the inbound IS the user object
// itself - `.user` was always undefined, so the token/password scrub
// never actually ran and auth material was persisted (encrypted only by
// the hardcoded-key transform below).
export const scrubSensitiveChatStateTransform = createTransform<
  any,
  any,
  Record<string, any>,
  Record<string, any>
>(
  (inboundState, key) =>
    key === 'user' && inboundState
      ? (sanitizeUserForPersistentStorage(inboundState) ?? inboundState)
      : inboundState,
  (outboundState) => outboundState
);

export const sanitizeRoomsStateTransform = createTransform<
  any,
  any,
  Record<string, any>,
  Record<string, any>
>(
  (inboundState, key) => sanitizeRoomsSliceKey(inboundState, key),
  (outboundState, key) => sanitizeRoomsSliceKey(outboundState, key)
);

const PERSIST_THROTTLE_MS = 500;

const chatSettingPersistConfig = {
  key: 'chatSettingStore',
  storage,
  throttle: PERSIST_THROTTLE_MS,
  blacklist: [
    'activeModal',
    'deleteModal',
    'selectedUser',
    'activeFile',
    'config.refreshTokens',
    'refreshTokens',
    'client',
    'config',
  ],
  transforms: [scrubSensitiveChatStateTransform, encryptor],
};

const roomsPersistConfig = {
  key: 'roomMessages',
  storage,
  throttle: PERSIST_THROTTLE_MS,
  blacklist: ['editAction', 'activeRoomJID', 'loadingText', 'isChatUiVisible'],
  transforms: [sanitizeRoomsStateTransform, limitMessagesTransform, encryptor],
};

const rootReducer = combineReducers({
  chatSettingStore: persistReducer(
    chatSettingPersistConfig,
    chatSettingsReducer
  ),
  rooms: persistReducer(roomsPersistConfig, roomsSlice),
  roomHeapSlice,
  call: callSlice,
});

export type RootState = ReturnType<typeof rootReducer>;

// Keep persistence scoped to the slices that actually need it. Persisting the
// already-persisted root state again can rehydrate malformed nested data and
// breaks the encrypt transform because it receives objects instead of strings.
const persistedReducer: Reducer<RootState, AnyAction> =
  rootReducer as Reducer<RootState, AnyAction>;

export const getActiveRoom = (state: RootState): IRoom | null => {
  const roomMessagesState = state.rooms;
  return roomMessagesState.activeRoomJID
    ? roomMessagesState.rooms[roomMessagesState.activeRoomJID]
    : null;
};

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: true,
      immutableCheck: { warnAfter: 128 },
      serializableCheck: {
        warnAfter: 128,
        ignoredActions: [
          'chat/addMessage',
          'persist/PERSIST',
          'persist/REHYDRATE',
          'persist/FLUSH',
          'persist/PAUSE',
          'persist/PURGE',
          'persist/REGISTER',
          'roomMessages/addRoomViaApi/pending',
          'roomMessages/addRoomViaApi/fulfilled',
          'roomMessages/addRoomViaApi/rejected',
          // setConfig payload contains non-serializable callback functions (eventHandlers)
          'chatSettingStore/setConfig',
        ],
        ignoredPaths: [
          'chat.messages.timestamp',
          'chatSettingStore.client',
          'chatSettingStore.config',
        ],
        ignoredActionPaths: ['result', 'register'],
      },
    })
      .concat(unreadMiddleware)
      .concat(newMessageMidlleware)
      .concat(logoutMiddleware)
      .concat(reactionsMiddleware),
  // .concat(testMiddleware)
  // .concat(debugMiddleware)
  // .concat(actionLoggerMiddleware),
});

export type AppDispatch = typeof store.dispatch;

export const persistor = persistStore(store);

// Dev-only: expose the redux store on window so QA / preview tooling can
// inspect / dispatch state during testing. Treeshakes out of production
// builds because the env check evaluates to a literal `false`.
try {
  const isDev =
    typeof import.meta !== 'undefined'
      ? Boolean((import.meta as any)?.env?.DEV)
      : false;
  if (typeof window !== 'undefined' && isDev) {
    (window as any).__ethoraStore = store;
    // eslint-disable-next-line no-console
    console.info('[ethora] redux store available as window.__ethoraStore');
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[ethora] failed to attach __ethoraStore bridge:', e);
}

try {
  ethoraLogger.always('[EthoraChatComponent] version:', ETHORA_CHAT_COMPONENT_VERSION);
} catch (e) {
  // Ignore console access issues in restricted runtimes.
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'ltx';

const get = vi.hoisted(() => vi.fn());
vi.mock('./apiClient', () => ({
  default: { get },
  setBaseURL: vi.fn(),
}));

import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { resetEthoraEvents } from './ethoraEvents';
import { setUserLookupRoute } from './api-requests/roomMembers.api';
import { resetUserResolver } from '../helpers/userResolver';
import { store } from '../roomStore';
import { setConfig, setUser } from '../roomStore/chatSettingsSlice';
import {
  addRoom,
  insertUsers,
  setLogoutState,
  updateRoom,
} from '../roomStore/roomsSlice';

const APP = '646cc8dc96d4a4dc8f7b2f2d';
const HOST = 'xmpp.example.com';
const CONF = `conference.${HOST}`;
const ADMIN = `admin@${HOST}`;
const uid = (n: number) => `${APP}_${String(n).padStart(24, '0')}`;
const CHAT = `${APP}_${'a'.repeat(24)}`;
const JID = `${CHAT}@${CONF}`;
const ME = uid(999);

const ws = { host: HOST, client: { jid: { getDomain: () => HOST } } } as any;

const evUser = (id: string, from = ADMIN, extra = '') =>
  parse(
    `<message type='headline' to='${ME}@${HOST}' from='${from}' id='ethora-event-1'>` +
      `<ethora-event xmlns='urn:ethora:events:1' type='user-profile-updated' ts='1' xmppUsername='${id}' appId='${APP}'${extra}/></message>`
  );
const evChat = (chat: string, from = ADMIN, type = 'chat-meta-updated') =>
  parse(
    `<message type='headline' to='${ME}@${HOST}' from='${from}' id='ethora-event-2'>` +
      `<ethora-event xmlns='urn:ethora:events:1' type='${type}' ts='1' chatName='${chat}' appId='${APP}'/></message>`
  );

const userAnswer = (id: string, first: string) => ({
  data: {
    result: {
      _id: id.split('_')[1],
      xmppUsername: id,
      firstName: first,
      lastName: 'Z',
      email: 'secret@x.test',
      profileImage: '',
    },
  },
});
const userCalls = () =>
  get.mock.calls.filter(([u]) => String(u).includes('/users'));
const roomCalls = () =>
  get.mock.calls.filter(([u]) => String(u).includes('/chats/my/'));
const room = () => (store.getState() as any).rooms.rooms[JID];
const members = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `m${i}`,
    xmppUsername: uid(i + 1),
    firstName: 'M',
    lastName: String(i),
  }));

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  resetUserResolver();
  resetEthoraEvents();
  setUserLookupRoute('v1');
  store.dispatch(setLogoutState());
  store.dispatch(
    setUser({
      _id: 'me',
      token: 'tok',
      xmppUsername: ME,
      appId: APP,
      firstName: 'Old',
      lastName: 'Me',
    } as any)
  );
  store.dispatch(setConfig({ appId: APP } as any));
  store.dispatch(
    addRoom({
      roomData: {
        jid: JID,
        name: 'Old title',
        title: 'Old title',
        description: 'old',
        type: 'public',
        members: members(30),
        usersCnt: 435,
        messages: [],
        lastMessage: { id: 'lm', body: 'last', roomJid: JID },
        unreadMessages: 7,
        apiUnreadCount: 7,
      } as any,
    } as any)
  );
  store.dispatch(updateRoom({ jid: JID, updates: { usersCnt: 435 } }));
});
afterEach(() => {
  setUserLookupRoute(null);
  vi.useRealTimers();
});

describe('user-profile-updated', () => {
  it('refetches a user already cached, bypassing the cache, and renames', async () => {
    store.dispatch(
      insertUsers({
        newUsers: [
          { _id: '1', xmppUsername: uid(1), firstName: 'Cached', lastName: 'A' },
        ],
      })
    );
    get.mockResolvedValue(userAnswer(uid(1), 'Fresh'));
    handleStanza(evUser(uid(1)), ws);
    expect(get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    expect(userCalls()).toHaveLength(1);
    expect(String(userCalls()[0][0])).toContain(encodeURIComponent(uid(1)));
    const u = (store.getState() as any).rooms.usersSet[uid(1)];
    expect(u.firstName).toBe('Fresh');
    expect(u.email).toBeUndefined();
  });

  it('coalesces a burst into one request', async () => {
    get.mockResolvedValue(userAnswer(uid(1), 'Fresh'));
    for (let i = 0; i < 5; i++) {
      handleStanza(evUser(uid(1)), ws);
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(700);
    expect(userCalls()).toHaveLength(1);
  });

  it('ignores a negative-cache entry', async () => {
    get.mockRejectedValueOnce({ response: { status: 404, data: 'USER_NOT_FOUND' } });
    const { requestUsers, isUserNotFound } = await import('../helpers/userResolver');
    requestUsers([uid(1)]);
    await vi.advanceTimersByTimeAsync(400);
    expect(isUserNotFound(uid(1))).toBe(true);
    get.mockResolvedValue(userAnswer(uid(1), 'Back'));
    handleStanza(evUser(uid(1)), ws);
    await vi.advanceTimersByTimeAsync(700);
    expect((store.getState() as any).rooms.usersSet[uid(1)].firstName).toBe('Back');
    expect(isUserNotFound(uid(1))).toBe(false);
  });

  it('updates the signed-in user when the event is about them', async () => {
    get.mockResolvedValue(userAnswer(ME, 'Newname'));
    handleStanza(evUser(ME), ws);
    await vi.advanceTimersByTimeAsync(900);
    const me = (store.getState() as any).chatSettingStore.user;
    expect(me.firstName).toBe('Newname');
    expect(me.token).toBe('tok');
  });

  it('ignores unsafe or foreign keys', async () => {
    for (const id of ['__proto__', 'constructor', 'x y', 'nounderscore', 'other_' + 'b'.repeat(24), `${APP}_${'a'.repeat(200)}`, '../etc_passwd']) {
      handleStanza(evUser(id), ws);
    }
    await vi.advanceTimersByTimeAsync(900);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('chat-meta-updated', () => {
  const answer = (over: any = {}) => ({
    data: {
      name: CHAT,
      type: 'public',
      title: 'New title',
      description: 'new desc',
      picture: 'https://img/x.png',
      usersCnt: 435,
      members: members(435),
      ...over,
    },
  });

  it('updates metadata only and leaves members, lastMessage and unread alone', async () => {
    get.mockResolvedValue(answer());
    const before = room();
    handleStanza(evChat(CHAT), ws);
    await vi.advanceTimersByTimeAsync(700);
    expect(roomCalls()).toHaveLength(1);
    expect(String(roomCalls()[0][0])).toBe(`/v1/chats/my/${CHAT}`);
    const r = room();
    expect(r.title).toBe('New title');
    expect(r.name).toBe('New title');
    expect(r.description).toBe('new desc');
    expect(r.picture).toBe('https://img/x.png');
    expect(r.icon).toBe('https://img/x.png');
    expect(r.usersCnt).toBe(435);
    expect(r.members).toBe(before.members);
    expect(r.members).toHaveLength(30);
    expect(r.lastMessage).toEqual(before.lastMessage);
    expect(r.unreadMessages).toBe(7);
    expect(r.apiUnreadCount).toBe(7);
  });

  it('never lowers usersCnt', async () => {
    get.mockResolvedValue(answer({ usersCnt: 12, members: members(12) }));
    handleStanza(evChat(CHAT), ws);
    await vi.advanceTimersByTimeAsync(700);
    expect(room().usersCnt).toBe(435);
    expect(room().members).toHaveLength(30);
  });

  it('debounces a burst and dedupes in flight', async () => {
    get.mockResolvedValue(answer());
    for (let i = 0; i < 5; i++) {
      handleStanza(evChat(CHAT), ws);
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(700);
    expect(roomCalls()).toHaveLength(1);
  });

  it('ignores a room that is not in the store', async () => {
    handleStanza(evChat(`${APP}_${'c'.repeat(24)}`), ws);
    await vi.advanceTimersByTimeAsync(900);
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps the old room and backs off after an error', async () => {
    get.mockRejectedValue({ response: { status: 500 } });
    handleStanza(evChat(CHAT), ws);
    await vi.advanceTimersByTimeAsync(700);
    expect(room().title).toBe('Old title');
    handleStanza(evChat(CHAT), ws);
    await vi.advanceTimersByTimeAsync(700);
    expect(roomCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(6000);
    handleStanza(evChat(CHAT), ws);
    await vi.advanceTimersByTimeAsync(700);
    expect(roomCalls()).toHaveLength(2);
  });

  it('ignores unsafe chatName', async () => {
    handleStanza(evChat('__proto__'), ws);
    handleStanza(evChat('a/../b_c'), ws);
    await vi.advanceTimersByTimeAsync(900);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('trust and robustness', () => {
  it('ignores unknown types and malformed events without throwing', async () => {
    expect(() => {
      handleStanza(evChat(CHAT, ADMIN, 'something-else'), ws);
      handleStanza(
        parse(
          `<message type='headline' from='${ADMIN}'><ethora-event xmlns='urn:ethora:events:1'/></message>`
        ),
        ws
      );
      handleStanza(
        parse(
          `<message type='headline' from='${ADMIN}'><ethora-event xmlns='urn:ethora:events:1' type='user-profile-updated'/></message>`
        ),
        ws
      );
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(900);
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ['room occupant', `${CHAT}@${CONF}/${uid(5)}`],
    ['user full jid', `${uid(5)}@${HOST}/web`],
    ['admin with a resource', `admin@${HOST}/res`],
    ['other domain', 'admin@evil.example.org'],
    ['conference domain', `admin@${CONF}`],
    ['no from', ''],
  ])('ignores a forged headline from %s', async (_n, from) => {
    get.mockResolvedValue(userAnswer(uid(1), 'Evil'));
    handleStanza(evUser(uid(1), from), ws);
    handleStanza(evChat(CHAT, from), ws);
    await vi.advanceTimersByTimeAsync(900);
    expect(get).not.toHaveBeenCalled();
  });

  it('ignores an event in a non-headline message', async () => {
    handleStanza(
      parse(
        `<message type='chat' from='${ADMIN}'><ethora-event xmlns='urn:ethora:events:1' type='chat-meta-updated' chatName='${CHAT}'/></message>`
      ),
      ws
    );
    await vi.advanceTimersByTimeAsync(900);
    expect(get).not.toHaveBeenCalled();
  });

  it('trustedEventSenders pins the sender', async () => {
    get.mockResolvedValue(userAnswer(uid(1), 'Pinned'));
    store.dispatch(
      setConfig({ appId: APP, trustedEventSenders: ['root'] } as any)
    );
    handleStanza(evUser(uid(1)), ws);
    await vi.advanceTimersByTimeAsync(900);
    expect(get).not.toHaveBeenCalled();
    handleStanza(evUser(uid(1), `root@${HOST}`), ws);
    await vi.advanceTimersByTimeAsync(900);
    expect(userCalls()).toHaveLength(1);
  });

  it('accepts an event wrapped in a mucsub envelope with a trusted inner sender', async () => {
    get.mockResolvedValue(userAnswer(uid(1), 'Wrapped'));
    handleStanza(
      parse(
        `<message from='${CONF}'><event xmlns='http://jabber.org/protocol/pubsub#event'><items><item>` +
          `<message type='headline' from='${ADMIN}'><ethora-event xmlns='urn:ethora:events:1' type='user-profile-updated' xmppUsername='${uid(1)}'/></message>` +
          `</item></items></event></message>`
      ),
      ws
    );
    await vi.advanceTimersByTimeAsync(900);
    expect(userCalls()).toHaveLength(1);
  });

  it('old user-update / chat-update headlines still work', async () => {
    handleStanza(
      parse(
        `<message type='headline' from='x'><chat-update xmlns='your:custom:ns' chatName='${CHAT}' title='Legacy'/></message>`
      ),
      ws
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(room().title).toBe('Legacy');
    expect(get).not.toHaveBeenCalled();
  });
});

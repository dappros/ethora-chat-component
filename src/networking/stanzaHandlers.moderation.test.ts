import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse, type Element } from 'ltx';

vi.mock('./api-requests/rooms.api', () => ({
  getRooms: vi.fn(),
  invalidateRoomsCache: vi.fn(),
  getRoomByName: vi.fn(),
}));

import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { store } from '../roomStore';
import { addRoom, setLogoutState, setRoomMessages } from '../roomStore/roomsSlice';
import type { IMessage } from '../types/types';

const ROOM = 'modroom@conference.xmpp.example.com';
const NS = 'urn:ethora:moderation';

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const getHistoryWindow = vi.fn();
const fakeClient = {
  username: 'me',
  queueDeliveryReceipt: vi.fn(),
  acknowledgeSentMessage: vi.fn(),
  getHistoryWindow,
} as never;

const messages = () =>
  (store.getState().rooms.rooms[ROOM]?.messages || []) as IMessage[];

describe('live moderation notices', () => {
  beforeEach(() => {
    store.dispatch(setLogoutState());
    store.dispatch(
      addRoom({
        roomData: { jid: ROOM, name: 'modroom', title: 'modroom', type: 'group', messages: [] } as never,
      })
    );
    store.dispatch(
      setRoomMessages({
        roomJID: ROOM,
        messages: [
          {
            id: '1730000000000001',
            xmppId: 'origin-1',
            body: 'hello there',
            date: new Date(1730000000000).toISOString(),
            roomJid: ROOM,
            user: { id: 'alice', name: 'Alice' },
          } as IMessage,
        ],
      })
    );
  });

  it('applies a notice to its target and adds no bubble', async () => {
    const before = store.getState().rooms.rooms[ROOM].unreadMessages ?? 0;
    handleStanza(
      parse(
        `<message from="${ROOM}" to="me@xmpp.example.com" type="groupchat"><moderation xmlns="${NS}" action="blur" category="pii" stanza-id="1730000000000001"/></message>`
      ) as Element,
      fakeClient
    );
    await flush();
    expect(messages()).toHaveLength(1);
    expect(messages()[0].moderation).toEqual({ action: 'blur', category: 'pii' });
    expect(store.getState().rooms.rooms[ROOM].unreadMessages ?? 0).toBe(before);
  });

  it('a user-level notice hides every message of that sender', async () => {
    handleStanza(
      parse(
        `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="hidden" category="suspension" user="alice"/></message>`
      ) as Element,
      fakeClient
    );
    await flush();
    expect(messages()).toHaveLength(1);
    expect(messages()[0].moderation?.action).toBe('hidden');
    expect(messages()[0].body).toBe('');
  });

  it('a bodiless notice for an unknown message is dropped silently', async () => {
    handleStanza(
      parse(
        `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="hidden" stanza-id="999"/></message>`
      ) as Element,
      fakeClient
    );
    await flush();
    expect(messages()).toHaveLength(1);
    expect(messages()[0].moderation).toBeUndefined();
  });

  it('a masked notice keeps the text and masks the sender', async () => {
    handleStanza(
      parse(
        `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="masked" user="alice"/></message>`
      ) as Element,
      fakeClient
    );
    await flush();
    expect(messages()[0].senderMasked).toBe(true);
    expect(messages()[0].body).toBe('hello there');
  });

  it('a restored notice re-reads the original from the archive', async () => {
    handleStanza(
      parse(
        `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="hidden" user="alice" mask-name="true"/></message>`
      ) as Element,
      fakeClient
    );
    await flush();
    expect(messages()[0].body).toBe('');
    getHistoryWindow.mockResolvedValueOnce({
      ok: true,
      complete: true,
      last: 1730000000000001,
      messages: [
        {
          id: '1730000000000001',
          body: 'hello there',
          date: new Date(1730000000000).toISOString(),
          roomJid: ROOM,
          user: { id: 'alice', name: 'Alice' },
        },
      ],
    });
    handleStanza(
      parse(
        `<message from="${ROOM}" type="groupchat"><moderation xmlns="${NS}" action="restored" user="alice"/></message>`
      ) as Element,
      fakeClient
    );
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getHistoryWindow).toHaveBeenCalledWith(ROOM, 50, { after: 1730000000000000 });
    expect(messages()).toHaveLength(1);
    expect(messages()[0].body).toBe('hello there');
    expect(messages()[0].moderation).toBeUndefined();
    expect(messages()[0].senderMasked).toBeUndefined();
    expect(messages()[0].xmppId).toBe('origin-1');
  });
});

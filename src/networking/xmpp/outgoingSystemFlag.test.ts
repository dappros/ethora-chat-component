/**
 * Outgoing <data> no longer carries isSystemMessage="false". Every reader
 * checks only === 'true', so the attribute was ~22 redundant bytes per
 * message and per archive row. 'true' still marks real system messages.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@xmpp/client';
import { Element } from 'ltx';
import { sendTextMessage } from './sendTextMessage.xmpp';
import { sendMediaMessage } from './sendMediaMessage.xmpp';
import { buildLocalCallLogMessage } from '../../helpers/callLogMessage';
import { store } from '../../roomStore';
import {
  addRoomViaApi,
  deleteAllRooms,
  setCurrentRoom,
  setChatUiVisible,
  addRoomMessage,
} from '../../roomStore/roomsSlice';
import { createRoomFromApi } from '../../helpers/createRoomFromApi';
import { IRoom } from '../../types/types';

const ROOM_JID = 'room@conference.xmpp.example';

const makeClient = () => {
  const sent: Element[] = [];
  const client = {
    jid: { toString: () => 'user@xmpp.example/web' },
    send: vi.fn((stanza: Element) => {
      sent.push(stanza);
    }),
  } as unknown as Client;
  return { client, sent };
};

describe('outgoing stanzas omit isSystemMessage', () => {
  it('text message has no isSystemMessage attribute', async () => {
    const { client, sent } = makeClient();
    await sendTextMessage(client, ROOM_JID, 'Ada', 'L', '', '0x1', 'hi');
    const data = sent[0].getChild('data');
    expect(data).toBeDefined();
    expect('isSystemMessage' in data!.attrs).toBe(false);
    expect(sent[0].toString()).not.toContain('isSystemMessage');
  });

  it('media message has no isSystemMessage attribute', async () => {
    const { client, sent } = makeClient();
    await sendMediaMessage(
      client,
      ROOM_JID,
      { firstName: 'Ada', lastName: 'L', location: 'x', mimetype: 'a/b' },
      'id-1'
    );
    expect(sent[0].toString()).not.toContain('isSystemMessage');
  });

  it('call-log system message still carries true', () => {
    const m = buildLocalCallLogMessage({
      callId: 'c1',
      direction: 'outgoing',
      durationMs: 1000,
      kind: 'audio',
      selfXmppUsername: 'me',
    });
    expect((m as any).isSystemMessage).toBe('true');
  });
});

describe('unread counting tolerates absent / false isSystemMessage', () => {
  const JID = 'app_room1@conference.example.com';
  const msg = (id: string, extra: Record<string, unknown> = {}) =>
    ({
      id,
      body: id,
      date: new Date(Date.now() + 10).toISOString(),
      roomJid: JID,
      user: { id: 'peer', name: 'peer' },
      ...extra,
    }) as never;

  beforeEach(() => {
    store.dispatch(deleteAllRooms());
    store.dispatch(setCurrentRoom({ roomJID: null }));
    store.dispatch(setChatUiVisible(true));
    store.dispatch(
      addRoomViaApi({
        room: createRoomFromApi(
          { name: 'app_room1', type: 'group', title: 'R' },
          'conference.example.com'
        ) as IRoom,
        xmpp: {} as never,
      })
    );
  });

  const unread = () => store.getState().rooms.rooms[JID].unreadMessages;

  it('absent field counts as a normal unread message', () => {
    store.dispatch(addRoomMessage({ roomJID: JID, message: msg('a') }));
    expect(unread()).toBe(1);
  });

  it("legacy 'false' still counts", () => {
    store.dispatch(
      addRoomMessage({
        roomJID: JID,
        message: msg('b', { isSystemMessage: 'false' }),
      })
    );
    expect(unread()).toBe(1);
  });

  it("'true' does not count", () => {
    store.dispatch(
      addRoomMessage({
        roomJID: JID,
        message: msg('c', { isSystemMessage: 'true' }),
      })
    );
    expect(unread()).toBe(0);
  });
});

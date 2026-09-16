import { describe, expect, it } from 'vitest';
import { createRoomFromApi } from './createRoomFromApi';
import { ApiRoom } from '../types/types';

const baseApiRoom: ApiRoom = {
  name: 'app1_room1',
  type: 'group',
  title: 'Room 1',
};

describe('createRoomFromApi - seeds `lastMessage` from the API for the room-list preview', () => {
  it('maps the API lastMessage into the LastMessage shape LastMessageItem renders', () => {
    const room = createRoomFromApi(
      {
        ...baseApiRoom,
        lastMessage: {
          body: 'hello there',
          truncated: false,
          from: 'alice@xmpp.example.com',
          fromUserId: 'alice-id',
          messageId: 'msg-1',
          stanzaId: 'stanza-1',
          createdAt: '2026-09-16T10:00:00.000Z',
          isOwn: false,
          senderFirstName: 'Alice',
          senderLastName: 'Smith',
        },
      },
      'conference.example.com'
    );

    expect(room?.lastMessage).toMatchObject({
      id: 'msg-1',
      xmppId: 'stanza-1',
      roomJid: 'app1_room1@conference.example.com',
      body: 'hello there',
      date: '2026-09-16T10:00:00.000Z',
      isDeleted: false,
      user: { id: 'alice-id', name: 'Alice Smith' },
    });
  });

  it('falls back to the stanzaId when messageId is absent', () => {
    const room = createRoomFromApi(
      {
        ...baseApiRoom,
        lastMessage: { body: 'hi', stanzaId: 'stanza-only' },
      },
      'conference.example.com'
    );
    expect(room?.lastMessage?.id).toBe('stanza-only');
  });

  // Prod may not send `lastMessage` at all yet - every field is optional
  // and the room must build normally without it.
  it('leaves lastMessage unset when the backend omits it entirely', () => {
    const room = createRoomFromApi(baseApiRoom, 'conference.example.com');
    expect(room?.lastMessage).toBeUndefined();
  });

  it('leaves lastMessage unset when the API sends an empty/whitespace body', () => {
    const room = createRoomFromApi(
      { ...baseApiRoom, lastMessage: { body: '   ' } },
      'conference.example.com'
    );
    expect(room?.lastMessage).toBeUndefined();
  });

  it('does not throw when senderFirstName/senderLastName are both absent', () => {
    const room = createRoomFromApi(
      { ...baseApiRoom, lastMessage: { body: 'no sender info' } },
      'conference.example.com'
    );
    expect(room?.lastMessage?.user?.name).toBe('');
    expect(room?.lastMessage?.body).toBe('no sender info');
  });
});

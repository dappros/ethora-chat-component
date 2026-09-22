import { describe, expect, it } from 'vitest';
import { findMessagesForFile } from './findMessagesForFile';
import { IMessage, IRoom } from '../types/types';

const ROOM_A = 'room-a@conference.example.com';
const ROOM_B = 'room-b@conference.example.com';

const makeRoom = (jid: string, messages: IMessage[]): IRoom =>
  ({
    jid,
    name: jid,
    title: jid,
    usersCnt: 0,
    messages,
    isLoading: false,
    roomBg: null,
  }) as IRoom;

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'media',
    date: new Date().toISOString(),
    roomJid: ROOM_A,
    user: { id: 'someone@example.com', name: 'Someone' },
    isMediafile: 'true',
    ...overrides,
  }) as IMessage;

describe('findMessagesForFile', () => {
  it('matches a single-attachment message by attachmentId in the file\'s own room', () => {
    const message = makeMessage({ id: 'm1', attachmentId: 'file-1' });
    const rooms = { [ROOM_A]: makeRoom(ROOM_A, [message]) };

    const matches = findMessagesForFile(rooms, {
      _id: 'file-1',
      roomName: ROOM_A,
    });

    expect(matches).toEqual([{ roomJID: ROOM_A, messageId: 'm1' }]);
  });

  it('matches a multi-attachment message via the attachments array', () => {
    const message = makeMessage({
      id: 'm2',
      attachments: [
        { attachmentId: 'other', location: 'https://x/other' },
        { attachmentId: 'file-1', location: 'https://x/file-1' },
      ] as IMessage['attachments'],
    });
    const rooms = { [ROOM_A]: makeRoom(ROOM_A, [message]) };

    const matches = findMessagesForFile(rooms, {
      _id: 'file-1',
      roomName: ROOM_A,
    });

    expect(matches).toEqual([{ roomJID: ROOM_A, messageId: 'm2' }]);
  });

  it('falls back to matching by location across every loaded room when the id is not on the message', () => {
    // No attachmentId anywhere (an older client, or a backend that never
    // sent one) - only the URL ties the message back to the file.
    const message = makeMessage({
      id: 'm3',
      roomJid: ROOM_B,
      location: 'https://secure-files.example.com/file-1',
    });
    const rooms = {
      [ROOM_A]: makeRoom(ROOM_A, []),
      [ROOM_B]: makeRoom(ROOM_B, [message]),
    };

    const matches = findMessagesForFile(rooms, {
      _id: 'file-1',
      // roomName points somewhere the message isn't loaded/known - the
      // fallback scan across all rooms must still find it.
      roomName: 'unknown-room@conference.example.com',
      location: 'https://secure-files.example.com/file-1',
    });

    expect(matches).toEqual([{ roomJID: ROOM_B, messageId: 'm3' }]);
  });

  it('never re-matches an already-deleted message', () => {
    const message = makeMessage({
      id: 'm4',
      attachmentId: 'file-1',
      isDeleted: true,
    });
    const rooms = { [ROOM_A]: makeRoom(ROOM_A, [message]) };

    const matches = findMessagesForFile(rooms, {
      _id: 'file-1',
      roomName: ROOM_A,
    });

    expect(matches).toEqual([]);
  });

  it('returns no matches when nothing lines up', () => {
    const rooms = {
      [ROOM_A]: makeRoom(ROOM_A, [makeMessage({ id: 'm5', attachmentId: 'other-file' })]),
    };

    const matches = findMessagesForFile(rooms, { _id: 'file-1', roomName: ROOM_A });

    expect(matches).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildNotificationContent,
  getNotificationTag,
  MAX_NOTIFICATION_BODY_LENGTH,
} from './messageNotificationContent';

const APP = '646cc8dc96d4a4dc8f7b2f2d';
const ME = `${APP}_6a4600aaaaaaaaaaaaaaaaaa`;
const ALICE = `${APP}_6a4600bbbbbbbbbbbbbbbbbb`;
const ROOM = `${APP}_room1@conference.xmpp.example.com`;

const usersSet = {
  [ALICE]: { _id: 'u', firstName: 'Alice', lastName: 'Smith', xmppUsername: ALICE },
} as any;

const room = (over: Record<string, unknown> = {}) =>
  ({ jid: ROOM, name: 'Team Room', title: 'Team Room', type: 'group', ...over }) as any;

const msg = (over: Record<string, unknown> = {}) =>
  ({
    id: 'm1',
    body: 'hello there',
    roomJid: ROOM,
    user: { id: ALICE, name: '' },
    ...over,
  }) as any;

const build = (over: Record<string, unknown> = {}) =>
  buildNotificationContent({
    message: msg(),
    roomJID: ROOM,
    room: room(),
    usersSet,
    currentXmppUsername: ME,
    activeRoomJID: null,
    tabVisible: false,
    locale: 'en',
    ...over,
  } as any);

describe('buildNotificationContent', () => {
  it('1:1 chat: title is the sender display name, body the text', () => {
    const c = build({ room: room({ type: 'private', name: ALICE }) })!;
    expect(c.title).toBe('Alice Smith');
    expect(c.body).toBe('hello there');
  });

  it('group chat: title is the room, body is prefixed with the sender', () => {
    const c = build()!;
    expect(c.title).toBe('Team Room');
    expect(c.body).toBe('Alice Smith: hello there');
  });

  it('truncates long bodies to about 120 characters', () => {
    const c = build({ message: msg({ body: 'x'.repeat(400) }) })!;
    const text = c.body.replace('Alice Smith: ', '');
    expect(text.length).toBeLessThanOrEqual(MAX_NOTIFICATION_BODY_LENGTH);
    expect(text.endsWith('…')).toBe(true);
  });

  it('labels attachments instead of showing a URL or file name', () => {
    const photo = build({
      message: msg({ body: 'https://x/y.jpg', mimetype: 'image/jpeg', location: 'https://x/y.jpg' }),
    })!;
    expect(photo.body).toBe('Alice Smith: Photo');
    const video = build({
      message: msg({ body: 'v', mimetype: 'video/mp4', location: 'https://x/v.mp4' }),
    })!;
    expect(video.body).toBe('Alice Smith: Video');
    const file = build({
      message: msg({ body: 'f', mimetype: 'application/pdf', location: 'https://x/f.pdf' }),
    })!;
    expect(file.body).toBe('Alice Smith: File');
    const photos = build({
      message: msg({
        body: '',
        attachments: [
          { location: 'a', mimetype: 'image/png' },
          { location: 'b', mimetype: 'image/png' },
          { location: 'c', mimetype: 'image/png' },
        ],
      }),
    })!;
    expect(photos.body).toBe('Alice Smith: 3 photos');
  });

  it('localises labels', () => {
    const c = build({
      locale: 'fr',
      message: msg({ body: 'v', mimetype: 'video/mp4', location: 'https://x/v.mp4' }),
    })!;
    expect(c.body).toBe('Alice Smith: Vidéo');
  });

  it('E2EE room: never carries message content', () => {
    const c = build({ room: room({ e2ee: true }) })!;
    expect(c.body).not.toContain('hello there');
    expect(c.body).toBe('Alice Smith: New message');
  });

  it('backend boilerplate body becomes the localised generic text', () => {
    const c = build({ message: msg({ body: 'You have a new message.' }), locale: 'es' })!;
    expect(c.body).toBe('Alice Smith: Mensaje nuevo');
  });

  it('skips the current user\'s own messages', () => {
    expect(build({ message: msg({ user: { id: ME, name: 'Me' } }) })).toBeNull();
  });

  it('skips the focused room while the tab is visible, not while hidden', () => {
    expect(build({ activeRoomJID: ROOM, tabVisible: true })).toBeNull();
    expect(build({ activeRoomJID: ROOM, tabVisible: false })).not.toBeNull();
  });

  it('skips muted rooms', () => {
    expect(build({ room: room({ muted: true }) })).toBeNull();
  });

  it('skips system, empty (typing/receipt) stanzas', () => {
    expect(build({ message: msg({ isSystemMessage: 'true' }) })).toBeNull();
    expect(build({ message: msg({ body: '  ' }) })).toBeNull();
  });

  it('unknown sender never leaks the raw appId_userId', () => {
    const stranger = `${APP}_6a4600cccccccccccccccccc`;
    const group = build({ message: msg({ user: { id: `${stranger}@xmpp.example.com`, name: stranger } }) })!;
    expect(group.title).toBe('Team Room');
    expect(group.body).toBe('hello there');
    const direct = build({
      room: room({ type: 'private', name: stranger, title: stranger }),
      message: msg({ user: { id: stranger, name: stranger } }),
    })!;
    expect(direct.title).toBe('New message');
    for (const c of [group, direct]) {
      expect(`${c.title} ${c.body}`).not.toContain(stranger);
      expect(`${c.title} ${c.body}`).not.toContain(APP);
    }
  });

  it('room unknown and sender unknown: localised New message title', () => {
    const c = build({
      room: undefined,
      message: msg({ user: { id: `${APP}_6a4600cccccccccccccccccc`, name: '' } }),
      locale: 'pt',
    })!;
    expect(c.title).toBe('Nova mensagem');
  });

  it('falls back to a readable username when there is no profile', () => {
    const c = build({ message: msg({ user: { id: 'bob@xmpp.example.com', name: '' } }) })!;
    expect(c.body).toBe('bob: hello there');
  });

  it('uses one tag per room', () => {
    expect(build()!.tag).toBe(getNotificationTag(ROOM));
    expect(build({ message: msg({ id: 'm2' }) })!.tag).toBe(build()!.tag);
  });
});

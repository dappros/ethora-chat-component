import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import ChatRoomItem from './ChatRoomItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom } from '../../types/types';
import {
  deriveMediaPreview,
  hasMediaPreview,
  pickPreviewSource,
} from '../../helpers/lastMessagePreview';

/**
 * Fixtures are the real QA payload shapes (ids and urls sanitised).
 *
 * 1. `GET /v1/chats/my` lastMessage of a media message: ONLY
 *    `body: "media"` and a `send-media-message:` messageId. No isMediafile,
 *    no mimetype, no attachments. createRoomFromApi maps messageId to `id`.
 * 2. History / live stanza: the message object with `isMediafile: "true"`,
 *    `mimetype: application/octet-stream`, `originalName: blob`, `location`
 *    and no `attachments` array (one stanza per file).
 */
const ROOM_JID = 'abc_room@conference.xmpp.example.com';
const SENDER = 'randomroman@gmail.com randomroman@gmail.com';

const apiThinMedia = {
  id: 'send-media-message:11111111-2222-3333-4444-555555555555',
  xmppId: '1791965344439204',
  roomJid: ROOM_JID,
  body: 'media',
  date: '2026-10-14T08:09:04.464Z',
  isDeleted: false,
  user: { id: 'user-1', name: SENDER },
};

const historyVoiceStanza = {
  id: '1791965344439204',
  xmppId: 'send-media-message:11111111-2222-3333-4444-555555555555',
  roomJid: ROOM_JID,
  body: 'media',
  date: '2026-10-14T08:09:04.439Z',
  isMediafile: 'true',
  fileName: '4f4dce86f9fb81141616d4727ddb67bb',
  location: 'https://secure-files.example.com/secure-media/4f4d.blob',
  locationPreview: '',
  mimetype: 'application/octet-stream',
  originalName: 'blob',
  size: '52460',
  isDeleted: false,
  user: { id: 'user-1', name: SENDER },
};

const room = (over: Partial<IRoom>): IRoom =>
  ({ jid: ROOM_JID, title: '12345', name: '12345', messages: [], ...over }) as IRoom;

const renderRow = (chat: IRoom) =>
  renderWithProviders(
    <ChatRoomItem
      chat={chat}
      isChatActive={false}
      performClick={() => {}}
      config={{} as never}
    />
  );

describe('media last message from real QA payloads', () => {
  it('API lastMessage with only body "media" and a media id is media, not text', () => {
    expect(hasMediaPreview(apiThinMedia as never)).toBe(true);
    expect(deriveMediaPreview(apiThinMedia as never)).toMatchObject({
      kind: 'attachment',
      caption: undefined,
    });
  });

  it('a text message that literally says "media" stays text', () => {
    expect(
      hasMediaPreview({ id: 'send-text-message-1-1', body: 'media' } as never)
    ).toBe(false);
  });

  it('history/live stanza with octet-stream blob reads as a voice message', () => {
    expect(deriveMediaPreview(historyVoiceStanza as never)).toMatchObject({
      kind: 'voice',
    });
  });

  it('a body that only echoes the sender name is not a caption', () => {
    const p = deriveMediaPreview(
      { ...historyVoiceStanza, body: 'randomroman@gmail.com' } as never,
      { senderNames: [SENDER] }
    );
    expect(p?.caption).toBeUndefined();
  });

  it('pickPreviewSource skips empty trailing stanzas and falls back to the seed', () => {
    const marker = { id: 'm', body: '', user: { id: 'u' } };
    expect(
      pickPreviewSource([historyVoiceStanza, marker] as never, apiThinMedia as never)
    ).toBe(historyVoiceStanza);
    expect(pickPreviewSource([marker] as never, apiThinMedia as never)).toBe(
      apiThinMedia
    );
  });

  it('row: API seed renders the media label, not the word "media"', () => {
    renderRow(room({ lastMessage: apiThinMedia as never }));
    expect(screen.getByTestId('last-message-media')).not.toBeNull();
    expect(screen.getByText('Attachment')).not.toBeNull();
    expect(screen.queryByText('media')).toBeNull();
  });

  it('row: loaded history wins and shows the voice label', () => {
    renderRow(
      room({
        messages: [historyVoiceStanza as never],
        lastMessage: apiThinMedia as never,
      })
    );
    expect(screen.getByText('Voice message')).not.toBeNull();
  });

  it('row: a live image album stanza shows N photos', () => {
    const album = {
      ...historyVoiceStanza,
      id: 'live-album',
      mimetype: undefined,
      originalName: undefined,
      location: undefined,
      attachments: Array.from({ length: 3 }, (_, i) => ({
        location: `https://files.example.com/${i}.jpg`,
        locationPreview: `https://files.example.com/${i}-s.jpg`,
        mimetype: 'image/jpeg',
        originalName: `${i}.jpg`,
      })),
    };
    renderRow(room({ messages: [historyVoiceStanza as never, album as never] }));
    expect(screen.getByText('3 photos')).not.toBeNull();
  });
});

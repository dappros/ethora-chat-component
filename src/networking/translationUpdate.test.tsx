/**
 * Async translation (mod_translate `translate_mode: async`).
 *
 * The server delivers a room message at once, untranslated, and marks the
 * live copy `<translation-pending xmlns="ethora:translate"/>`. Once the
 * translation service answers, the room sends every occupant online a
 * headline `<translation-update/>`. Until it lands the bubble says
 * "Translating…" (auto mode inline, manual mode once the link is clicked);
 * then the translation takes its place without a reload.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { parse } from 'ltx';
import { store } from '../roomStore';
import { setUser } from '../roomStore/chatSettingsSlice';
import { addRoom, addRoomMessage, setLogoutState } from '../roomStore/roomsSlice';
import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { getDataFromXml } from '../helpers/getDataFromXml';
import {
  resolveMessageTranslation,
  TRANSLATION_PENDING_MAX_AGE_MS,
} from '../helpers/resolveMessageTranslation';
import { renderWithProviders } from '../test/renderWithProviders';
import { Message } from '../components/MessageBubble/Message';
import MessageTranslate from '../components/MessageBubble/MessageTranslate';
import { IMessage, IRoom } from '../types/types';

vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const APP = '646cc8dc96d4a4dc8f7b2f2d';
const ME = `${APP}_6a2718bcef26ca2d3e1b78c3`;
const THEM = `${APP}_6a46007ce7b43f307b6da578`;
const ROOM = `${APP}_6f0a1c2e-3d4b-5a6f-8b9c-0d1e2f3a4b5c@conference.example.com`;
const TEXT = 'hello everyone, see you tomorrow';
const PORTUGUESE = 'olá a todos, até amanhã';

// A MAM / stanza id: the 13-digit millisecond time, then microseconds.
const archiveIdAt = (ms: number) => `${ms}123`;

const TRANSLATIONS_JSON = JSON.stringify({
  translates: [
    { translatedText: TEXT, language: 'en', languageName: 'English' },
    { translatedText: PORTUGUESE, language: 'pt', languageName: 'Portuguese' },
  ],
});

const ws = { host: 'example.com', username: ME } as any;

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const liveStanza = (archiveId: string, mark = "<translation-pending xmlns='ethora:translate'/>") =>
  parse(
    `<message from='${ROOM}/${THEM}' to='${ME}@example.com/r' type='groupchat' id='msg-1'>` +
      `<body>${TEXT}</body><translate source='en'/>` +
      `<stanza-id xmlns='urn:xmpp:sid:0' by='${ROOM}' id='${archiveId}'/>${mark}</message>`
  );

const updateStanza = (attrs: string, from = ROOM, type = 'headline') =>
  parse(
    `<message from='${from}' to='${ME}@example.com/r' type='${type}' id='translation-1'>` +
      `<translation-update xmlns='ethora:translate' ${attrs}/></message>`
  );

const done = (id: string) =>
  updateStanza(`id='${id}' xmppId='msg-1' status='done' value="${escapeAttr(TRANSLATIONS_JSON)}"`);

// The edit of a message as the room relays it (mod_edit), with what it says
// about the translations of the new text.
const EDITED = 'hello everyone, see you on Friday';
const EDITED_PORTUGUESE = 'olá a todos, até sexta';
const EDITED_JSON = JSON.stringify({
  translates: [
    { translatedText: EDITED, language: 'en', languageName: 'English' },
    { translatedText: EDITED_PORTUGUESE, language: 'pt', languageName: 'Portuguese' },
  ],
});

const editStanza = (archiveId: string, mark: 'pending' | 'translations' | 'none') =>
  parse(
    `<message from='${ROOM}/${THEM}' to='${ME}@example.com/r' type='groupchat' id='edit-message-1'>` +
      `<replace id='${archiveId}' text='${EDITED}'/>` +
      `<stanza-id xmlns='urn:xmpp:sid:0' by='${ROOM}' id='${archiveIdAt(Date.now() + 1)}'/>` +
      (mark === 'pending' ? "<translation-pending xmlns='ethora:translate'/>" : '') +
      (mark === 'translations' ? `<translations value="${escapeAttr(EDITED_JSON)}"/>` : '') +
      `</message>`
  );

const pendingMessage = (archiveId: string, over: Partial<IMessage> = {}): IMessage =>
  ({
    id: archiveId,
    xmppId: 'msg-1',
    body: TEXT,
    langSource: 'en',
    translationPending: true,
    roomJid: ROOM,
    date: new Date(Number(archiveId.slice(0, 13))).toISOString(),
    user: { id: THEM, name: 'John' },
    ...over,
  }) as IMessage;

const room = (): IRoom =>
  ({ jid: ROOM, name: 'r', title: 'r', usersCnt: 0, messages: [], isLoading: false, roomBg: '' }) as IRoom;

const messageInStore = (id: string) =>
  ((store.getState() as any).rooms.rooms[ROOM]?.messages || []).find(
    (m: IMessage) => m.id === id
  ) as IMessage | undefined;

describe('the live copy carries the pending mark', () => {
  it('parses <translation-pending/> off a live message', async () => {
    const parsed = await getDataFromXml(liveStanza(archiveIdAt(Date.now())));
    expect(parsed.translationPending).toBe(true);
    expect(parsed.translations).toBeUndefined();
  });

  it('no mark (sync server, archive copy, other namespace): not pending', async () => {
    expect((await getDataFromXml(liveStanza(archiveIdAt(Date.now()), ''))).translationPending).toBeUndefined();
    expect(
      (await getDataFromXml(liveStanza(archiveIdAt(Date.now()), '<translation-pending/>'))).translationPending
    ).toBeUndefined();
  });
});

describe('<translation-update/> from the room', () => {
  beforeEach(() => {
    store.dispatch(setLogoutState());
    store.dispatch(setUser({ xmppUsername: ME } as any));
    store.dispatch(addRoom({ roomData: room() }));
  });

  it('attaches the translation, matched by the archive id', () => {
    const id = archiveIdAt(Date.now());
    store.dispatch(addRoomMessage({ roomJID: ROOM, message: pendingMessage(id) }));

    handleStanza(done(id), ws);

    const msg = messageInStore(id)!;
    expect(msg.translations?.pt?.translatedText).toBe(PORTUGUESE);
    expect(msg.translationPending).toBe(false);
  });

  it('matches by the sender’s id when there is no archive id', () => {
    const id = archiveIdAt(Date.now());
    store.dispatch(addRoomMessage({ roomJID: ROOM, message: pendingMessage(id) }));

    handleStanza(
      updateStanza(`xmppId='msg-1' status='done' value="${escapeAttr(TRANSLATIONS_JSON)}"`),
      ws
    );

    expect(messageInStore(id)!.translations?.pt?.translatedText).toBe(PORTUGUESE);
  });

  it('a failed translation ends the pending state and attaches nothing', () => {
    const id = archiveIdAt(Date.now());
    store.dispatch(addRoomMessage({ roomJID: ROOM, message: pendingMessage(id) }));

    handleStanza(updateStanza(`id='${id}' xmppId='msg-1' status='failed'`), ws);

    const msg = messageInStore(id)!;
    expect(msg.translationPending).toBe(false);
    expect(msg.translations).toBeUndefined();
  });

  it('ignores an update that does not come from the room itself', () => {
    const id = archiveIdAt(Date.now());
    store.dispatch(addRoomMessage({ roomJID: ROOM, message: pendingMessage(id) }));
    const attrs = `id='${id}' status='done' value="${escapeAttr(TRANSLATIONS_JSON)}"`;

    handleStanza(updateStanza(attrs, `${ROOM}/${THEM}`), ws);
    handleStanza(updateStanza(attrs, `${THEM}@example.com`), ws);

    const msg = messageInStore(id)!;
    expect(msg.translations).toBeUndefined();
    expect(msg.translationPending).toBe(true);
  });
});

describe('an edit', () => {
  beforeEach(() => {
    store.dispatch(setLogoutState());
    store.dispatch(setUser({ xmppUsername: ME } as any));
    store.dispatch(addRoom({ roomData: room() }));
  });

  const translatedMessage = (id: string) =>
    pendingMessage(id, {
      translationPending: undefined,
      translations: { pt: { translatedText: PORTUGUESE, language: 'pt', languageName: 'Portuguese' } },
    });

  it('async server: the old translation goes, pending, then the new one', () => {
    const id = archiveIdAt(Date.now());
    store.dispatch(addRoomMessage({ roomJID: ROOM, message: translatedMessage(id) }));

    handleStanza(editStanza(id, 'pending'), ws);

    let msg = messageInStore(id)!;
    expect(msg.body).toBe(EDITED);
    expect(msg.translations).toBeUndefined();
    expect(msg.translationPending).toBe(true);
    expect(msg.translationPendingSince).toBeGreaterThan(Date.now() - 5000);

    handleStanza(
      updateStanza(`id='${id}' xmppId='msg-1' status='done' value="${escapeAttr(EDITED_JSON)}"`),
      ws
    );
    msg = messageInStore(id)!;
    expect(msg.translations?.pt?.translatedText).toBe(EDITED_PORTUGUESE);
    expect(msg.translationPending).toBe(false);
  });

  it('sync server: the translations of the new text come with the edit', () => {
    const id = archiveIdAt(Date.now());
    store.dispatch(addRoomMessage({ roomJID: ROOM, message: translatedMessage(id) }));

    handleStanza(editStanza(id, 'translations'), ws);

    const msg = messageInStore(id)!;
    expect(msg.translations?.pt?.translatedText).toBe(EDITED_PORTUGUESE);
    expect(msg.translationPending).toBe(false);
  });

  it('nothing about translations (older server, failed): the old one is dropped', () => {
    const id = archiveIdAt(Date.now());
    store.dispatch(addRoomMessage({ roomJID: ROOM, message: translatedMessage(id) }));

    handleStanza(editStanza(id, 'none'), ws);

    const msg = messageInStore(id)!;
    expect(msg.body).toBe(EDITED);
    expect(msg.translations).toBeUndefined();
    expect(msg.translationPending).toBe(false);
  });

  it('pending counts from the edit, not from the message', () => {
    vi.useFakeTimers();
    try {
      const message = pendingMessage(archiveIdAt(Date.now() - 60 * 60_000), {
        translationPendingSince: Date.now(),
      });
      expect(resolveMessageTranslation(message, 'pt').isPending).toBe(true);
      vi.advanceTimersByTime(TRANSLATION_PENDING_MAX_AGE_MS + 1000);
      expect(resolveMessageTranslation(message, 'pt').isPending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveMessageTranslation: isPending', () => {
  afterEach(() => vi.useRealTimers());

  it('is pending while the server translates, until the window closes', () => {
    vi.useFakeTimers();
    const message = pendingMessage(archiveIdAt(Date.now()));
    expect(resolveMessageTranslation(message, 'pt').isPending).toBe(true);

    vi.advanceTimersByTime(TRANSLATION_PENDING_MAX_AGE_MS + 1000);
    expect(resolveMessageTranslation(message, 'pt').isPending).toBe(false);
  });

  it('not pending once translated, in the reader’s language, or without the mark', () => {
    const id = archiveIdAt(Date.now());
    const translated = pendingMessage(id, {
      translations: { pt: { translatedText: PORTUGUESE, language: 'pt', languageName: 'Portuguese' } },
    });
    expect(resolveMessageTranslation(translated, 'pt').isPending).toBe(false);
    expect(resolveMessageTranslation(pendingMessage(id, { langSource: 'pt' }), 'pt').isPending).toBe(false);
    expect(
      resolveMessageTranslation(pendingMessage(id, { translationPending: undefined }), 'pt').isPending
    ).toBe(false);
  });
});

describe('the bubble', () => {
  const translatedVersion = (message: IMessage): IMessage => ({
    ...message,
    translationPending: false,
    translations: { pt: { translatedText: PORTUGUESE, language: 'pt', languageName: 'Portuguese' } },
  });

  const state = (config: any) => ({
    chatSettingStore: { user: { xmppUsername: ME }, config } as any,
    rooms: { rooms: { [ROOM]: room() }, usersSet: {} } as any,
  });

  it('auto mode: the original with "Translating…", then the translation in its place', () => {
    const message = pendingMessage(archiveIdAt(Date.now()));
    const config = { translates: { enabled: true, mode: 'auto', readerLocale: 'pt' } };
    const { rerender, queryByTestId, container } = renderWithProviders(
      <Message message={message} isUser={false} isReply={false} />,
      { preloadedState: state(config) }
    );
    expect(container.textContent).toContain(TEXT);
    expect(queryByTestId('message-translating')?.textContent).toBe('Translating…');

    rerender(<Message message={translatedVersion(message)} isUser={false} isReply={false} />);
    expect(container.textContent).toContain(PORTUGUESE);
    expect(queryByTestId('message-translating')).toBeNull();
  });

  it('auto mode: never on the reader’s own message', () => {
    const config = { translates: { enabled: true, mode: 'auto', readerLocale: 'pt' } };
    const { queryByTestId } = renderWithProviders(
      <Message message={pendingMessage(archiveIdAt(Date.now()))} isUser={true} isReply={false} />,
      { preloadedState: state(config) }
    );
    expect(queryByTestId('message-translating')).toBeNull();
  });

  it('manual mode: the link is offered, a click shows "Translating…", then the translation', () => {
    const message = pendingMessage(archiveIdAt(Date.now()));
    const config = { translates: { enabled: true, mode: 'manual', readerLocale: 'pt' } };
    const { rerender } = renderWithProviders(
      <MessageTranslate message={message} isUser={false} config={config as any} />,
      { preloadedState: state(config) }
    );

    fireEvent.click(screen.getByText('Translate'));
    expect(screen.getByText('Translating…')).toBeTruthy();

    rerender(<MessageTranslate message={translatedVersion(message)} isUser={false} config={config as any} />);
    expect(screen.getByText(PORTUGUESE)).toBeTruthy();
    expect(screen.queryByText('Translating…')).toBeNull();
  });

  it('manual mode: a failed translation takes the link away', () => {
    const message = pendingMessage(archiveIdAt(Date.now()));
    const config = { translates: { enabled: true, mode: 'manual', readerLocale: 'pt' } };
    const { rerender, container } = renderWithProviders(
      <MessageTranslate message={message} isUser={false} config={config as any} />,
      { preloadedState: state(config) }
    );
    fireEvent.click(screen.getByText('Translate'));

    rerender(
      <MessageTranslate message={{ ...message, translationPending: false }} isUser={false} config={config as any} />
    );
    expect(container.textContent).toBe('');
  });
});

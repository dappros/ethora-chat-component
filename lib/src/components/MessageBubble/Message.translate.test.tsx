import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hello',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'me', name: 'Me' },
    langSource: 'en',
    translations: {
      pt: { translatedText: 'olá', language: 'pt', languageName: 'Portuguese' },
    },
    ...overrides,
  }) as IMessage;

const makeRoom = (): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
  }) as IRoom;

function renderMessage(
  message: IMessage,
  isUser: boolean,
  translatesConfig: any,
  translateMode?: 'auto' | 'manual'
) {
  return renderWithProviders(
    <Message message={message} isUser={isUser} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me' },
          translateMode,
          config: { translates: translatesConfig },
        } as any,
        rooms: { rooms: { [ROOM_JID]: makeRoom() }, usersSet: {} } as any,
      },
    }
  );
}

const autoConfig = { enabled: true, mode: 'auto', readerLocale: 'pt' };

describe('Message - auto-translate quote + primary text', () => {
  it('shows the translated text as primary and the original as a small quote (incoming message)', () => {
    const { container, getByText } = renderMessage(
      makeMessage(),
      false,
      autoConfig
    );

    expect(getByText('olá')).toBeTruthy();
    expect(container.textContent).toContain('hello');
  });

  // The sender already knows what they wrote - showing them a translated
  // quote of their own message is noise, not useful confirmation.
  it('shows the sender their own message in plain text, with no translation quote', () => {
    const { getByText, queryByText } = renderMessage(makeMessage(), true, autoConfig);

    expect(getByText('hello')).toBeTruthy();
    expect(queryByText('olá')).toBeNull();
  });

  it('shows no quote and just the plain body when the message is already in the reader language', () => {
    const message = makeMessage({
      body: 'olá',
      langSource: 'pt',
      translations: { pt: { translatedText: 'olá', language: 'pt', languageName: 'Portuguese' } },
    });
    const { container, queryByText } = renderMessage(message, false, autoConfig);

    expect(queryByText('|')).toBeNull();
    expect(container.textContent).toContain('olá');
  });

  it('does not restructure the body at all when translates is disabled', () => {
    const { getByText, queryByText } = renderMessage(
      makeMessage(),
      false,
      { enabled: false }
    );

    expect(getByText('hello')).toBeTruthy();
    expect(queryByText('olá')).toBeNull();
  });

  it('does not restructure the body in manual mode (untouched by this change)', () => {
    const { getByText, queryByText } = renderMessage(makeMessage(), false, {
      enabled: true,
      mode: 'manual',
      readerLocale: 'pt',
    });

    // Plain original body shown; the "Translate" link (manual mode) handles
    // the rest via its own click-to-reveal flow, untouched here.
    expect(getByText('hello')).toBeTruthy();
    expect(queryByText('olá')).toBeNull();
  });
});

// The reader's own auto/manual pick (set via the language-selector modal's
// switcher) must actually change what Message.tsx renders, not just sit
// unused in redux - this is the wiring resolveTranslateMode exists for.
describe('Message - reader-picked translate mode overrides the host default', () => {
  it('reader picked manual - auto-quote does not appear even though the host default is auto', () => {
    const { getByText, queryByText } = renderMessage(
      makeMessage(),
      false,
      { enabled: true, mode: 'auto', readerLocale: 'pt' },
      'manual'
    );

    expect(getByText('hello')).toBeTruthy();
    expect(queryByText('olá')).toBeNull();
  });

  it('reader picked auto - the quote appears even though the host default is manual', () => {
    const { getByText } = renderMessage(
      makeMessage(),
      false,
      { enabled: true, mode: 'manual', readerLocale: 'pt' },
      'auto'
    );

    expect(getByText('olá')).toBeTruthy();
  });

  it('forceType pins the host mode even when the reader had picked the opposite', () => {
    const { container, getByText } = renderMessage(
      makeMessage(),
      false,
      { enabled: true, mode: 'auto', forceType: true, readerLocale: 'pt' },
      'manual'
    );

    // Forced auto wins over the reader's stale 'manual' pick: the
    // translation shows as primary text with the original as a quote -
    // manual mode would show only the plain original, no quote at all.
    expect(getByText('olá')).toBeTruthy();
    expect(container.textContent).toContain('hello');
  });
});

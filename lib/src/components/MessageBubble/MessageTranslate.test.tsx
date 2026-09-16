import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import MessageTranslate from './MessageTranslate';
import { IMessage, IRoom } from '../../types/types';

const fetchTranslationMock = vi.fn();
vi.mock('../../networking/api-requests/translate.api', () => ({
  fetchTranslation: (...args: unknown[]) => fetchTranslationMock(...args),
}));

const ROOM_JID = 'room1@conference.example.com';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'Bonjour tout le monde',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'other', name: 'Other' },
    langSource: 'fr',
    ...overrides,
  }) as IMessage;

const makeRoom = (message: IMessage): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [message],
    isLoading: false,
    roomBg: '',
  }) as IRoom;

function renderTranslate(message: IMessage, config: any) {
  const storeRef: { current: any } = { current: null };
  const result = renderWithProviders(
    <MessageTranslate message={message} isUser={false} config={config} />,
    {
      storeRef,
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config } as any,
        rooms: {
          rooms: { [ROOM_JID]: makeRoom(message) },
          usersSet: {},
        } as any,
      },
    }
  );
  return { ...result, storeRef };
}

const baseConfig = {
  translates: { enabled: true, mode: 'manual', readerLocale: 'en' },
  baseUrl: 'https://api.chat-qa.ethora.com/v1',
};

describe('MessageTranslate - resolution order', () => {
  beforeEach(() => {
    fetchTranslationMock.mockReset();
  });

  it('host onTranslate wins even when a translation is already attached', async () => {
    const onTranslate = vi.fn().mockResolvedValue('hello from host');
    const message = makeMessage({
      translations: {
        en: { translatedText: 'hello from stanza', language: 'en', languageName: 'English' },
      },
    });
    const config = {
      ...baseConfig,
      translates: { ...baseConfig.translates, onTranslate },
    };

    renderTranslate(message, config);
    fireEvent.click(screen.getByText('Translate'));

    await waitFor(() => expect(screen.getByText('hello from host')).toBeTruthy());
    expect(onTranslate).toHaveBeenCalledWith(
      message.body,
      expect.objectContaining({ sourceLocale: 'fr', targetLocale: 'en' })
    );
    expect(fetchTranslationMock).not.toHaveBeenCalled();
  });

  it('uses an attached translation without making any request', async () => {
    const message = makeMessage({
      translations: {
        en: { translatedText: 'Hello everyone', language: 'en', languageName: 'English' },
      },
    });

    renderTranslate(message, baseConfig);
    fireEvent.click(screen.getByText('Translate'));

    await waitFor(() => expect(screen.getByText('Hello everyone')).toBeTruthy());
    expect(fetchTranslationMock).not.toHaveBeenCalled();
  });

  it('fetches from the translate service when nothing is attached, renders and caches the result', async () => {
    fetchTranslationMock.mockResolvedValue({
      translatedText: 'Hello everyone',
      language: 'en-CA',
      languageName: 'Canadian English',
    });
    const message = makeMessage();

    const { storeRef } = renderTranslate(message, baseConfig);
    fireEvent.click(screen.getByText('Translate'));

    await waitFor(() => expect(screen.getByText('Hello everyone')).toBeTruthy());

    expect(fetchTranslationMock).toHaveBeenCalledWith(
      message.body,
      'fr',
      'en',
      'https://translate.api.chat-qa.ethora.com/translate'
    );

    const cached =
      storeRef.current.getState().rooms.rooms[ROOM_JID].messages[0].translations;
    expect(cached['en-CA'].translatedText).toBe('Hello everyone');
  });

  it('a reader locale of "en" resolves and caches a returned "en-CA" entry (second click is free)', async () => {
    fetchTranslationMock.mockResolvedValue({
      translatedText: 'Hello everyone',
      language: 'en-CA',
      languageName: 'Canadian English',
    });
    const message = makeMessage();

    renderTranslate(message, baseConfig);
    fireEvent.click(screen.getByText('Translate'));
    await waitFor(() => expect(screen.getByText('Hello everyone')).toBeTruthy());

    expect(fetchTranslationMock).toHaveBeenCalledTimes(1);
  });

  it('shows "Could not translate" when the fetch resolves with nothing, and a retry click fetches again', async () => {
    fetchTranslationMock.mockResolvedValueOnce(undefined);
    const message = makeMessage();

    renderTranslate(message, baseConfig);
    fireEvent.click(screen.getByText('Translate'));

    await waitFor(() => expect(screen.getByText('Could not translate')).toBeTruthy());
    expect(fetchTranslationMock).toHaveBeenCalledTimes(1);

    fetchTranslationMock.mockResolvedValueOnce({
      translatedText: 'Hello everyone',
      language: 'en-CA',
      languageName: 'Canadian English',
    });
    fireEvent.click(screen.getByText('Could not translate'));

    await waitFor(() => expect(screen.getByText('Hello everyone')).toBeTruthy());
    expect(fetchTranslationMock).toHaveBeenCalledTimes(2);
  });

  it('shows "Could not translate" when the fetch rejects', async () => {
    fetchTranslationMock.mockRejectedValueOnce(new Error('network down'));
    const message = makeMessage();

    renderTranslate(message, baseConfig);
    fireEvent.click(screen.getByText('Translate'));

    await waitFor(() => expect(screen.getByText('Could not translate')).toBeTruthy());
  });

  it('derives no endpoint (and still ends in error) when config.baseUrl is not in the api.* shape', async () => {
    fetchTranslationMock.mockResolvedValue(undefined);
    const message = makeMessage();
    const config = {
      translates: { enabled: true, mode: 'manual', readerLocale: 'en' },
      baseUrl: 'https://app.chat.ethora.com',
    };

    renderTranslate(message, config);
    fireEvent.click(screen.getByText('Translate'));

    await waitFor(() => expect(screen.getByText('Could not translate')).toBeTruthy());
    expect(fetchTranslationMock).toHaveBeenCalledWith(
      message.body,
      'fr',
      'en',
      undefined
    );
  });

  it('config.translates.endpoint overrides the derived endpoint', async () => {
    fetchTranslationMock.mockResolvedValue({
      translatedText: 'Hello everyone',
      language: 'en',
      languageName: 'English',
    });
    const message = makeMessage();
    const config = {
      translates: {
        enabled: true,
        mode: 'manual',
        readerLocale: 'en',
        endpoint: 'https://custom.example.com/translate',
      },
      baseUrl: 'https://api.chat-qa.ethora.com/v1',
    };

    renderTranslate(message, config);
    fireEvent.click(screen.getByText('Translate'));

    await waitFor(() => expect(screen.getByText('Hello everyone')).toBeTruthy());
    expect(fetchTranslationMock).toHaveBeenCalledWith(
      message.body,
      'fr',
      'en',
      'https://custom.example.com/translate'
    );
  });
});

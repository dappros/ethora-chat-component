import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../networking/api-requests/translate.api', () => ({
  fetchMessageTranslations: vi.fn(),
}));

import { fetchMessageTranslations } from '../networking/api-requests/translate.api';
import {
  useMessageTranslation,
  resetMessageTranslationCacheForTests,
} from './useMessageTranslation';

const fetchMock = fetchMessageTranslations as ReturnType<typeof vi.fn>;

const Probe: React.FC<{
  message: any;
  readerLocale?: string;
  enabled?: boolean;
}> = ({ message, readerLocale, enabled = true }) => {
  const { hasTranslation, displayText } = useMessageTranslation(
    message,
    readerLocale,
    enabled
  );
  return <div data-testid="out">{`${hasTranslation}|${displayText}`}</div>;
};

const out = () => screen.getByTestId('out').textContent;

const spanishMessage = { body: 'hola', langSource: 'es' };

// Translation moved OFF the send path (where it blocked every send on an
// HTTP round trip, translating into languages nobody might read) and onto
// the reader: their language only, messages they actually look at only.
describe('useMessageTranslation', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetMessageTranslationCacheForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it('translates a foreign-language message into the reader language', async () => {
    fetchMock.mockResolvedValue([
      { language: 'en', languageName: 'English', translatedText: 'hello' },
    ]);

    render(<Probe message={spanishMessage} readerLocale="en" />);

    await waitFor(() => expect(out()).toBe('true|hello'));
    expect(fetchMock).toHaveBeenCalledWith('hola', 'es', ['en']);
  });

  it('makes NO request for a message already in the reader language', () => {
    render(<Probe message={{ body: 'hello', langSource: 'en' }} readerLocale="en" />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(out()).toBe('false|hello');
  });

  it('ignores region when deciding - en-US reader vs en-CA message is not a translation job', () => {
    render(
      <Probe message={{ body: 'hello', langSource: 'en-CA' }} readerLocale="en-US" />
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(out()).toBe('false|hello');
  });

  it('makes no request when disabled (on-demand mode owns its own flow)', () => {
    render(<Probe message={spanishMessage} readerLocale="en" enabled={false} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(out()).toBe('false|hola');
  });

  it('makes no request when the source language is unknown', () => {
    render(<Probe message={{ body: 'hola' }} readerLocale="en" />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers a translation already attached to the stanza over a request', async () => {
    render(
      <Probe
        message={{
          body: 'hola',
          langSource: 'es',
          translations: {
            en: { translatedText: 'hello (from stanza)', language: 'en', languageName: 'English' },
          },
        }}
        readerLocale="en"
      />
    );

    await waitFor(() => expect(out()).toBe('true|hello (from stanza)'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches across remounts - scrolling a message away and back costs nothing', async () => {
    fetchMock.mockResolvedValue([
      { language: 'en', languageName: 'English', translatedText: 'hello' },
    ]);

    const first = render(<Probe message={spanishMessage} readerLocale="en" />);
    await waitFor(() => expect(out()).toBe('true|hello'));
    first.unmount();

    render(<Probe message={spanishMessage} readerLocale="en" />);
    // Served from cache synchronously, and no second request.
    expect(out()).toBe('true|hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent renders of the same text into ONE request', async () => {
    fetchMock.mockResolvedValue([
      { language: 'en', languageName: 'English', translatedText: 'hello' },
    ]);

    render(
      <>
        <Probe message={spanishMessage} readerLocale="en" />
        <Probe message={spanishMessage} readerLocale="en" />
        <Probe message={spanishMessage} readerLocale="en" />
      </>
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('falls back to the original text when the service fails', async () => {
    fetchMock.mockResolvedValue([]);

    render(<Probe message={spanishMessage} readerLocale="en" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(out()).toBe('false|hola');
  });
});
